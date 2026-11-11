import { ContactFlags, ErrorBanner, TeamView } from "@/components/views";
import { can } from "@/lib/auth/permissions";
import { loadProject } from "@/lib/project-context";
import { getTeam } from "@/lib/services";
import { addContactAction, addGroupAction, deleteContactAction, updateContactAction } from "../../../actions";

type Contact = Awaited<ReturnType<typeof getTeam>>[number]["contacts"][number];

function ContactFields({ c }: { c?: Contact }) {
  return (
    <div className="grid gap-2 md:grid-cols-3">
      <label><span>Nama</span><input name="name" required defaultValue={c?.name} /></label>
      <label><span>Jabatan</span><input name="jobTitle" defaultValue={c?.jobTitle} /></label>
      <label><span>Perusahaan / vendor</span><input name="company" defaultValue={c?.company} /></label>
      <label><span>Email</span><input name="email" type="email" defaultValue={c?.email} /></label>
      <label><span>Telepon</span><input name="phone" defaultValue={c?.phone} /></label>
      <label><span>Catatan</span><input name="notes" defaultValue={c?.notes} /></label>
      <div className="flex flex-wrap gap-x-4 gap-y-1 md:col-span-3">
        <label className="flex items-center gap-1"><input type="checkbox" name="isPic" defaultChecked={c?.isPic} /> Person in charge</label>
        <label className="flex items-center gap-1"><input type="checkbox" name="isContact" defaultChecked={c?.isContact} /> Person in contact</label>
        <label className="flex items-center gap-1"><input type="checkbox" name="needsAccess" defaultChecked={c?.needsAccess} /> Email perlu diberi akses</label>
        <label className="flex items-center gap-1"><input type="checkbox" name="internal" defaultChecked={c?.internal} /> Internal (tidak tampil di link view-only)</label>
      </div>
    </div>
  );
}

export default async function Team({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string }> }) {
  const { slug } = await params;
  const { error } = await searchParams;
  const { db, project, role } = await loadProject(slug);
  const team = await getTeam(db, project.id, { includeInternal: true });
  if (!can(role, "team.edit")) return <TeamView team={team} />;

  return (
    <>
      <ErrorBanner message={error} />
      {team.map((g) => (
        <section key={g.id} className="card space-y-2">
          <h2>{g.name}</h2>
          {g.contacts.map((c) => (
            <details key={c.id} className="border-t border-neutral-100 pt-2">
              <summary>
                <span className="text-neutral-900">{c.name}</span>{" "}
                <span className="text-neutral-500">{[c.jobTitle, c.company, c.email, c.phone].filter(Boolean).join(" · ")}</span>{" "}
                <ContactFlags c={c} />
              </summary>
              <form action={updateContactAction} className="mt-2 space-y-2">
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="contactId" value={c.id} />
                <input type="hidden" name="groupId" value={g.id} />
                <ContactFields c={c} />
                <button className="btn">Simpan</button>{" "}
                <button formAction={deleteContactAction} formNoValidate className="btn-quiet">Hapus</button>
              </form>
            </details>
          ))}
          <details className="border-t border-neutral-100 pt-2">
            <summary>+ Tambah kontak</summary>
            <form action={addContactAction} className="mt-2 space-y-2">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="groupId" value={g.id} />
              <ContactFields />
              <button className="btn">Tambah</button>
            </form>
          </details>
        </section>
      ))}
      <form action={addGroupAction} className="card flex items-end gap-3">
        <input type="hidden" name="slug" value={slug} />
        <label className="flex-1"><span>Departemen / vendor baru</span><input name="name" required /></label>
        <button className="btn">Tambah departemen</button>
      </form>
    </>
  );
}
