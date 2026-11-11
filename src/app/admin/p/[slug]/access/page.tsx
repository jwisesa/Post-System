import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ConfirmButton, CopyButton } from "@/components/ui/controls";
import { ErrorBanner } from "@/components/views";
import { can } from "@/lib/auth/permissions";
import { loadProject } from "@/lib/project-context";
import { listMembers, listShareLinks } from "@/lib/services";
import { addMemberAction, createShareLinkAction, removeMemberAction, revokeShareLinkAction } from "../../../actions";

export default async function Access({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string }> }) {
  const { slug } = await params;
  const { error } = await searchParams;
  const { db, user, project, role } = await loadProject(slug);
  if (!can(role, "access.manage")) notFound();
  const [members, links, h] = await Promise.all([listMembers(db, project.id), listShareLinks(db, user.id, project.id), headers()]);
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;

  return (
    <>
      <h1>Akses</h1>
      <ErrorBanner message={error} />
      <section className="card space-y-3">
        <div>
          <h2>Akun admin</h2>
          <p className="muted mt-1 text-xs">Supervisor: akses penuh. Assistant: status jadwal dan direktori tim; tidak bisa mengubah tanggal, Technical Page, atau akses.</p>
        </div>
        <ul className="divide-y divide-line">
          {members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center gap-3 py-2">
              <span aria-hidden className="grid size-8 place-items-center rounded-full bg-raised text-xs font-semibold">{m.name.slice(0, 2).toUpperCase()}</span>
              <span className="min-w-0 flex-1"><span className="font-medium">{m.name}</span>{m.userId === user.id && <span className="muted"> (Anda)</span>}<br /><span className="muted text-xs">{m.email}</span></span>
              <span className={`tag ${m.role === "supervisor" ? "tag-accent" : ""}`}>{m.role}</span>
              {m.userId !== user.id && (
                <form action={removeMemberAction}>
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="userId" value={m.userId} />
                  <ConfirmButton message={`Cabut akses ${m.name} dari project ini?`}>Cabut akses</ConfirmButton>
                </form>
              )}
            </li>
          ))}
        </ul>
        <details className="border-t border-line pt-3">
          <summary className="font-medium text-accent">+ Beri akses admin</summary>
          <form action={addMemberAction} className="mt-3 grid items-end gap-3 md:grid-cols-5">
            <input type="hidden" name="slug" value={slug} />
            <label><span>Email</span><input name="email" type="email" required /></label>
            <label><span>Role</span><select name="role"><option value="assistant">assistant</option><option value="supervisor">supervisor</option></select></label>
            <label><span>Nama (akun baru)</span><input name="name" /></label>
            <label><span>Password sementara (akun baru)</span><input name="password" type="text" minLength={8} autoComplete="off" /></label>
            <button className="btn">Beri akses</button>
          </form>
        </details>
      </section>

      <section className="card space-y-3">
        <div>
          <h2>Link view-only</h2>
          <p className="muted mt-1 text-xs">Siapa pun yang memegang link bisa melihat project ini tanpa login dan tanpa bisa mengubah apa pun. Item bertanda internal tidak ditampilkan.</p>
        </div>
        {links.length === 0 && <p className="muted text-sm">Belum ada link.</p>}
        <ul className="divide-y divide-line">
          {links.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
              <span className="w-28 shrink-0 truncate font-medium">{l.label}</span>
              {l.revokedAt ? (
                <span className="tag">Dicabut</span>
              ) : (
                <>
                  <a className="min-w-0 flex-1 truncate font-mono text-xs text-accent" href={`/v/${l.token}`} target="_blank">{`${origin}/v/${l.token}`}</a>
                  <CopyButton text={`${origin}/v/${l.token}`} label="Salin link" />
                  <form action={revokeShareLinkAction}>
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="linkId" value={l.id} />
                    <ConfirmButton message={`Cabut link "${l.label}"? Yang memegang link ini tidak bisa membukanya lagi.`}>Cabut</ConfirmButton>
                  </form>
                </>
              )}
            </li>
          ))}
        </ul>
        <form action={createShareLinkAction} className="flex items-end gap-3 border-t border-line pt-3">
          <input type="hidden" name="slug" value={slug} />
          <label className="flex-1"><span>Label link baru (mis. Director, Producer)</span><input name="label" required /></label>
          <button className="btn">Buat link</button>
        </form>
      </section>
    </>
  );
}
