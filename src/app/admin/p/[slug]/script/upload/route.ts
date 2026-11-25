import { getDb } from "@/db/client";
import { can } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { extractPages, MAX_BYTES } from "@/lib/script/extract";
import { parseScreenplay } from "@/lib/script/parse";
import { textBytes } from "@/lib/script/types";
import { aggregate } from "@/lib/script/aggregate";
import { ImportSchema } from "@/lib/script/service";
import { getProjectForUser, InputError } from "@/lib/services";

export const maxDuration = 60;

const json = (body: object, status = 200) => Response.json(body, { status });

/** Reads the PDF in memory, returns the parsed scenes and text as a preview. Nothing is stored here, and the PDF is never written to disk. */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return json({ error: "Belum masuk." }, 401);
  const row = await getProjectForUser(await getDb(), user.id, slug);
  if (!row) return json({ error: "Project tidak ditemukan." }, 404);
  if (!can(row.role, "script.edit")) return json({ error: "Hanya supervisor yang bisa mengimpor naskah." }, 403);
  try {
    const file = (await req.formData()).get("file");
    if (!(file instanceof File) || !file.size) throw new InputError("Pilih file PDF naskah.");
    if (file.size > MAX_BYTES) throw new InputError("File terlalu besar (maksimal 4 MB).");
    const { scenes, pages, warnings } = parseScreenplay(await extractPages(new Uint8Array(await file.arrayBuffer())));
    const check = ImportSchema.safeParse({ title: "x", sourceName: "x", pages, scenes });
    if (!check.success) {
      const at = check.error.issues[0]?.path[1];
      const sc = typeof at === "number" ? scenes[at] : undefined;
      return json({ error: sc ? `Adegan ${sc.number} terlalu panjang (${sc.lines.toLocaleString("id-ID")} baris): judul adegan berikutnya tidak terbaca.` : "Hasil baca naskah tidak valid. Periksa isi PDF." }, 400);
    }
    const agg = aggregate(scenes, pages);
    return json({
      title: file.name.replace(/\.pdf$/i, "").slice(0, 200), sourceName: file.name.slice(0, 200), pages, scenes, warnings,
      summary: { scenes: scenes.length, characters: agg.characters.length, locations: agg.locations.length, seconds: agg.totalSeconds, textBytes: scenes.reduce((n, x) => n + textBytes(x.blocks), 0), topCharacters: agg.characters.slice(0, 5).map((c) => c.name) },
    });
  } catch (e) {
    if (e instanceof InputError) return json({ error: e.message }, 400);
    console.error(e);
    return json({ error: "Naskah tidak dikenali: file tidak bisa dibaca sebagai PDF." }, 400);
  }
}
