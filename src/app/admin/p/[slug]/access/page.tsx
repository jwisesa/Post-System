import { headers } from "next/headers";
import { notFound } from "next/navigation";
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
      <ErrorBanner message={error} />
      <section className="card space-y-3">
        <h2>Akun admin</h2>
        <table className="w-full">
          <thead><tr><th>Nama</th><th>Email</th><th>Role</th><th /></tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.userId} className="border-t border-neutral-100">
                <td>{m.name}</td><td>{m.email}</td><td>{m.role}</td>
                <td>
                  {m.userId !== user.id && (
                    <form action={removeMemberAction}>
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="userId" value={m.userId} />
                      <button className="btn-quiet">Cabut akses</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form action={addMemberAction} className="grid items-end gap-2 border-t border-neutral-100 pt-3 md:grid-cols-5">
          <input type="hidden" name="slug" value={slug} />
          <label><span>Email</span><input name="email" type="email" required /></label>
          <label><span>Role</span><select name="role"><option value="assistant">assistant</option><option value="supervisor">supervisor</option></select></label>
          <label><span>Nama (akun baru)</span><input name="name" /></label>
          <label><span>Password sementara (akun baru)</span><input name="password" type="text" minLength={8} autoComplete="off" /></label>
          <button className="btn">Beri akses</button>
        </form>
        <p className="text-xs text-neutral-500">Supervisor: akses penuh. Assistant: bisa mengubah direktori tim, tidak bisa mengubah Technical Page atau akses.</p>
      </section>

      <section className="card space-y-3">
        <h2>Link view-only</h2>
        <p className="text-xs text-neutral-500">Siapa pun yang memegang link bisa melihat project ini tanpa login, tanpa bisa mengubah apa pun. Item bertanda internal tidak ditampilkan.</p>
        {links.length === 0 && <p className="text-sm text-neutral-500">Belum ada link.</p>}
        <ul className="space-y-2">
          {links.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-3 border-t border-neutral-100 pt-2 text-sm">
              <span className="font-medium">{l.label}</span>
              {l.revokedAt ? (
                <span className="tag">Dicabut</span>
              ) : (
                <>
                  <a className="break-all text-blue-700" href={`/v/${l.token}`}>{`${origin}/v/${l.token}`}</a>
                  <form action={revokeShareLinkAction}>
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="linkId" value={l.id} />
                    <button className="btn-quiet">Cabut</button>
                  </form>
                </>
              )}
            </li>
          ))}
        </ul>
        <form action={createShareLinkAction} className="flex items-end gap-3 border-t border-neutral-100 pt-3">
          <input type="hidden" name="slug" value={slug} />
          <label className="flex-1"><span>Label (mis. Director, Producer)</span><input name="label" required /></label>
          <button className="btn">Buat link</button>
        </form>
      </section>
    </>
  );
}
