import Link from "next/link";
import { ScriptUpload } from "@/components/script/ScriptUpload";
import { ScriptView } from "@/components/script/ScriptView";
import { can } from "@/lib/auth/permissions";
import { fmtDate } from "@/lib/schedule/dates";
import { loadProject } from "@/lib/project-context";
import { getScript, kindUsage, listKinds, listPhases, listScripts } from "@/lib/script/service";

export default async function ScriptPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ script?: string; new?: string; tag?: string; scene?: string }> }) {
  const { slug } = await params;
  const q = await searchParams;
  const { db, project, role } = await loadProject(slug);
  const list = await listScripts(db, project.id);
  const wantNew = q.new != null;
  const current = wantNew ? null : await getScript(db, project.id, list.find((s) => s.id === q.script)?.id ?? list[0]?.id ?? "");
  const phases = current ? await listPhases(db, project.id) : [];
  const customKinds = current ? (await listKinds(db, project.id)).map((k) => ({ id: k.id, key: k.key, label: k.label, color: k.color })) : [];
  const usage = current ? await kindUsage(db, project.id) : {};
  const canEdit = can(role, "script.edit");
  const base = `/admin/p/${slug}/script`;
  return (
    <div className="mx-auto max-w-[1240px] space-y-4 sm:space-y-8">
      <div>
        <h1 className="page-title">Naskah</h1>
        <p className="page-meta max-sm:hidden">Breakdown naskah dari PDF: daftar adegan dengan perkiraan durasi, tokoh, lokasi, dan export CSV.</p>
      </div>
      {list.length > 0 && (
        <nav aria-label="Versi naskah" className="flex items-center gap-3 max-sm:overflow-x-auto sm:flex-wrap">
          {list.map((s) => (
            <Link key={s.id} href={`${base}?script=${s.id}`} className={current?.script.id === s.id ? "btn-secondary" : "btn-ghost"} aria-current={current?.script.id === s.id ? "page" : undefined}>{s.title}{list.filter((x) => x.title === s.title).length > 1 && ` · ${fmtDate(s.createdAt.toISOString().slice(0, 10))}`}</Link>
          ))}
          {canEdit && !wantNew && <Link href={`${base}?new`} className="btn-secondary">Unggah naskah baru</Link>}
        </nav>
      )}
      {canEdit && (wantNew || list.length === 0) && <ScriptUpload slug={slug} />}
      {!canEdit && list.length === 0 && <p className="muted text-sm">Belum ada naskah. Supervisor dapat mengunggah PDF naskah.</p>}
      {current && (
        <ScriptView
          slug={slug}
          canEdit={canEdit}
          script={{ id: current.script.id, title: current.script.title, sourceName: current.script.sourceName, pages: current.script.pages }}
          scenes={current.scenes}
          agg={current.aggregate}
          phases={phases}
          initialTag={q.tag ?? ""}
          initialScene={q.scene ?? ""}
          textIds={current.textIds}
          customKinds={customKinds}
          kindUsage={usage}
        />
      )}
    </div>
  );
}
