"use client";

import { useState } from "react";
import { addContactAction, deleteContactAction, updateContactAction } from "@/app/admin/actions";
import { ConfirmButton, CopyButton, Drawer } from "./ui/controls";
import { ContactFlags, type Contact, type Team } from "./views";

function ContactForm({ slug, team, contact, groupId }: { slug: string; team: Team; contact?: Contact; groupId?: string }) {
  return (
    <form action={contact ? updateContactAction : addContactAction} className="space-y-3">
      <input type="hidden" name="slug" value={slug} />
      {contact && <input type="hidden" name="contactId" value={contact.id} />}
      <label><span>Nama</span><input name="name" required defaultValue={contact?.name} autoFocus /></label>
      <label>
        <span>Departemen / vendor</span>
        <select name="groupId" defaultValue={contact?.groupId ?? groupId}>{team.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label><span>Jabatan</span><input name="jobTitle" defaultValue={contact?.jobTitle} /></label>
        <label><span>Perusahaan</span><input name="company" defaultValue={contact?.company} /></label>
        <label><span>Email</span><input name="email" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" defaultValue={contact?.email} /></label>
        <label><span>Telepon</span><input name="phone" type="tel" inputMode="tel" defaultValue={contact?.phone} /></label>
      </div>
      <label><span>Catatan</span><textarea name="notes" rows={2} defaultValue={contact?.notes} /></label>
      <div className="space-y-2">
        <label className="check"><input type="checkbox" name="isPic" defaultChecked={contact?.isPic} /> Person in charge</label>
        <label className="check"><input type="checkbox" name="isContact" defaultChecked={contact?.isContact} /> Person in contact</label>
        <label className="check"><input type="checkbox" name="needsAccess" defaultChecked={contact?.needsAccess} /> Email perlu diberi akses</label>
        <label className="check"><input type="checkbox" name="internal" defaultChecked={contact?.internal} /> Internal (tidak tampil di link view-only)</label>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button className="btn">{contact ? "Simpan" : "Tambah kontak"}</button>
        {contact && <ConfirmButton formAction={deleteContactAction} formNoValidate message={`Hapus kontak "${contact.name}"?`}>Hapus</ConfirmButton>}
      </div>
    </form>
  );
}

/** Searchable team table. With `slug` it is editable (drawer); without it is read-only. */
export function TeamDirectory({ team, slug }: { team: Team; slug?: string }) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const [panel, setPanel] = useState<{ contact?: Contact } | null>(null);
  const q = query.trim().toLowerCase();
  const rows = team
    .filter((g) => !group || g.id === group)
    .flatMap((g) => g.contacts.map((c) => ({ c, g })))
    .filter(({ c, g }) => !q || [c.name, c.jobTitle, c.company, c.email, c.phone, g.name].some((v) => v.toLowerCase().includes(q)));
  const accessEmails = team.flatMap((g) => g.contacts).filter((c) => c.needsAccess && c.email).map((c) => c.email);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <input className="max-w-xs" type="search" inputMode="search" enterKeyHint="search" autoCapitalize="none" autoCorrect="off" placeholder="Cari nama, vendor, email…" aria-label="Cari kontak" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="max-w-52" aria-label="Filter departemen" value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="">Semua departemen</option>
          {team.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.contacts.length})</option>)}
        </select>
        <div className="ml-auto flex gap-2">
          {accessEmails.length > 0 && <CopyButton text={accessEmails.join(", ")} label={`Salin ${accessEmails.length} email perlu akses`} />}
          {slug && <button type="button" className="btn" onClick={() => setPanel({})}>+ Kontak</button>}
        </div>
      </div>
      <div className="overflow-x-auto">
        {rows.length === 0 ? (
          <p className="empty muted">{q || group ? "Tidak ada kontak yang cocok." : "Belum ada kontak."}</p>
        ) : (
          <table className="table">
            <thead><tr><th>Nama</th><th>Departemen</th><th>Jabatan</th><th>Perusahaan</th><th>Email</th><th>Telepon</th></tr></thead>
            <tbody>
              {rows.map(({ c, g }) => (
                <tr key={c.id} className="hoverable">
                  <td>
                    {slug ? <button type="button" className="cursor-pointer text-left font-medium hover:underline" onClick={() => setPanel({ contact: c })}>{c.name}</button> : <span className="font-medium">{c.name}</span>}{" "}
                    <ContactFlags c={c} />
                    {c.notes && <div className="muted text-xs">{c.notes}</div>}
                  </td>
                  <td className="muted">{g.name}</td>
                  <td>{c.jobTitle}</td>
                  <td>{c.company}</td>
                  <td>{c.email && <a className="underline underline-offset-2" href={`mailto:${c.email}`}>{c.email}</a>}</td>
                  <td className="whitespace-nowrap">{c.phone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {slug && panel && (
        <Drawer title={panel.contact ? panel.contact.name : "Kontak baru"} onClose={() => setPanel(null)}>
          <ContactForm key={panel.contact?.id ?? "new"} slug={slug} team={team} contact={panel.contact} groupId={group || team[0]?.id} />
        </Drawer>
      )}
    </>
  );
}
