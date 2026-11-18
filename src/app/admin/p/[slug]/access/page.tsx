import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ConfirmButton, CopyButton } from "@/components/ui/controls";
import { Icon } from "@/components/ui/icons";
import { ErrorBanner } from "@/components/views";
import { can } from "@/lib/auth/permissions";
import { loadProject } from "@/lib/project-context";
import { WHO } from "@/lib/feedback/parse";
import { listReviewerLinks } from "@/lib/review/service";
import { getSchedule } from "@/lib/schedule/service";
import { listMembers, listShareLinks } from "@/lib/services";
import { addMemberAction, createReviewerLinkAction, createShareLinkAction, removeMemberAction, revokeReviewerLinkAction, revokeShareLinkAction, updateReviewerLinkItemsAction } from "../../../actions";

export default async function Access({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string }> }) {
  const { slug } = await params;
  const { error } = await searchParams;
  const { db, user, project, role } = await loadProject(slug);
  if (!can(role, "access.manage")) notFound();
  const [members, links, reviewers, schedule, h] = await Promise.all([listMembers(db, project.id), listShareLinks(db, user.id, project.id), listReviewerLinks(db, user.id, project.id), getSchedule(db, project.id, { includeInternal: false }), headers()]);
  // Non-internal milestones grouped by track, then phase.
  const groups = schedule.tracks.map((t) => ({
    id: t.id, name: t.name,
    phases: t.items.filter((i) => !i.parentId).map((p) => ({ id: p.id, name: p.name, stones: t.items.filter((m) => m.parentId === p.id) })).filter((p) => p.stones.length),
  })).filter((t) => t.phases.length);
  const picker = (chosen: string[]) => (
    <div className="max-h-56 space-y-2 overflow-auto">
      {groups.map((t) => (
        <fieldset key={t.id} className="space-y-1">
          <legend className="text-xs font-semibold text-ink-2">{t.name}</legend>
          {t.phases.map((p) => (
            <div key={p.id} className="space-y-0.5 ps-2">
              <div className="muted text-xs">{p.name}</div>
              {p.stones.map((m) => <label key={m.id} className="check ps-2"><input type="checkbox" name="itemIds" value={m.id} defaultChecked={chosen.includes(m.id)} /> {m.name} <span className="muted text-xs">{m.dueDate}</span></label>)}
            </div>
          ))}
        </fieldset>
      ))}
      {groups.length === 0 && <p className="muted text-sm">Belum ada milestone.</p>}
    </div>
  );
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;

  return (
    <div className="mx-auto max-w-[1040px] space-y-10">
      <h1 className="page-title">Akses</h1>
      <ErrorBanner message={error} />
      <section className="card">
        <div>
          <h2 className="section-band">Akun admin</h2>
          <p className="muted mt-1 text-[13px]">Supervisor: akses penuh. Assistant: status jadwal dan direktori tim; tidak bisa mengubah tanggal, Technical Page, atau akses.</p>
        </div>
        <ul className="rows mt-3">
          {members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center gap-3 py-2">
                            <span className="min-w-0 flex-1"><span className="font-medium">{m.name}</span>{m.userId === user.id && <span className="muted"> (Anda)</span>}<br /><span className="muted text-xs">{m.email}</span></span>
              <span className={`tag ${m.role === "supervisor" ? "!text-ink" : ""}`}>{m.role}</span>
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
        <details className="hairline mt-3 pt-3">
          <summary className="btn-ghost inline-flex cursor-pointer list-none"><Icon name="plus" />Beri akses admin</summary>
          <form action={addMemberAction} className="mt-3 grid items-end gap-3 md:grid-cols-5">
            <input type="hidden" name="slug" value={slug} />
            <label><span>Email</span><input name="email" type="email" inputMode="email" required autoCapitalize="none" autoCorrect="off" enterKeyHint="next" /></label>
            <label><span>Role</span><select name="role"><option value="assistant">assistant</option><option value="supervisor">supervisor</option></select></label>
            <label><span>Nama (akun baru)</span><input name="name" /></label>
            <label><span>Password sementara (akun baru)</span><input name="password" type="text" minLength={8} autoComplete="off" autoCapitalize="none" autoCorrect="off" /></label>
            <button className="btn">Beri akses</button>
          </form>
        </details>
      </section>

      <section className="card">
        <div>
          <h2 className="section-band">Link view-only</h2>
          <p className="muted mt-1 text-[13px]">Siapa pun yang memegang link bisa melihat project ini tanpa login dan tanpa bisa mengubah apa pun. Item bertanda internal tidak ditampilkan.</p>
        </div>
        {links.length === 0 && <p className="muted mt-3 text-sm">Belum ada link.</p>}
        <ul className="rows mt-3">
          {links.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
              <span className="w-28 shrink-0 truncate font-medium">{l.label}</span>
              {l.revokedAt ? (
                <span className="tag">Dicabut</span>
              ) : (
                <>
                  <a className="min-w-0 flex-1 truncate font-mono text-xs underline underline-offset-2" href={`/v/${l.token}`} target="_blank">{`${origin}/v/${l.token}`}</a>
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
        <form action={createShareLinkAction} className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="slug" value={slug} />
          <label className="min-w-48 flex-1"><span>Label link baru (mis. Director, Producer)</span><input name="label" required /></label>
          <button className="btn">Buat link</button>
        </form>
      </section>
      <section className="card">
        <div>
          <h2 className="section-band">Link reviewer</h2>
          <p className="muted mt-1 text-[13px]">Satu link per orang, tanpa akun. Orang itu hanya melihat milestone yang Anda pilih: bisa menulis feedback dan menyetujui. Cabut kapan saja.</p>
        </div>
        {reviewers.length === 0 && <p className="muted mt-3 text-sm">Belum ada link reviewer.</p>}
        <ul className="rows mt-3">
          {reviewers.map((l) => (
            <li key={l.id} className="space-y-2 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-3">
                <span className="w-40 shrink-0 truncate font-medium">{l.name}{l.role && <span className="muted"> · {l.role}</span>}</span>
                {l.revokedAt ? (
                  <span className="tag">Dicabut</span>
                ) : (
                  <>
                    <a className="min-w-0 flex-1 truncate font-mono text-xs underline underline-offset-2" href={`/r/${l.token}`} target="_blank">{`${origin}/r/${l.token}`}</a>
                    <CopyButton text={`${origin}/r/${l.token}`} label="Salin link" />
                    <form action={revokeReviewerLinkAction}>
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="linkId" value={l.id} />
                      <ConfirmButton message={`Cabut link "${l.name}"? Yang memegang link ini tidak bisa membukanya lagi.`}>Cabut</ConfirmButton>
                    </form>
                  </>
                )}
              </div>
              {!l.revokedAt && (
                <details>
                  <summary className="btn-ghost inline-flex cursor-pointer list-none">Milestone ({l.itemIds.length})</summary>
                  <form action={updateReviewerLinkItemsAction} className="mt-2 space-y-2">
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="linkId" value={l.id} />
                    {picker(l.itemIds)}
                    <button className="btn-secondary">Simpan milestone</button>
                  </form>
                </details>
              )}
            </li>
          ))}
        </ul>
        <form action={createReviewerLinkAction} className="hairline mt-3 space-y-3 pt-3">
          <input type="hidden" name="slug" value={slug} />
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-48 flex-1"><span>Nama</span><input name="name" required maxLength={60} /></label>
            <label className="min-w-48 flex-1"><span>Peran (mis. Sutradara)</span><input name="role" list="reviewer-roles" maxLength={60} autoComplete="off" /></label>
            <datalist id="reviewer-roles">{WHO.map((w) => <option key={w} value={w} />)}</datalist>
          </div>
          {picker([])}
          <button className="btn">Buat link reviewer</button>
        </form>
      </section>
    </div>
  );
}
