// "Aset & dokumen": project documents plus every link grouped by track and item.
import { DOCUMENT_LABELS, LINK_LABELS } from "@/lib/assets/catalog";
import type { Attachment } from "@/lib/assets/service";
import type { Schedule } from "@/lib/schedule/service";
import { AttachmentList } from "./AttachmentList";

type Props = { projectId: string; schedule: Schedule; attachments: Attachment[]; slug: string; canEdit: boolean; canApprove: boolean };

export function AssetsOverview({ projectId, schedule, attachments, slug, canEdit, canApprove }: Props) {
  const of = (type: string, id: string) => attachments.filter((a) => a.targetType === type && a.targetId === id);
  const common = { slug, canEdit, canApprove };
  const names = schedule.tracks.map((t) => t.name);
  const rows = schedule.tracks.map((t, n) => ({ t, withLinks: t.items.filter((i) => of("schedule_item", i.id).length > 0), label: names.filter((x) => x === t.name).length > 1 ? `${t.name} (${names.slice(0, n + 1).filter((x) => x === t.name).length})` : t.name }));
  const filled = rows.filter((r) => r.withLinks.length), empties = rows.filter((r) => !r.withLinks.length);
  return (
    <>
      <section className="card">
        <div>
          <h2 className="section-band">Dokumen produksi</h2>
          <p className="muted mt-1 text-xs">Script, script report, camera/sound report, grab still, dan dokumen lain untuk seluruh project.</p>
        </div>
        <AttachmentList attachments={of("project", projectId)} target={{ type: "project", id: projectId }} labelOptions={DOCUMENT_LABELS} defaultKind="document" empty="Belum ada dokumen." {...common} />
      </section>
      {empties.length > 0 && <p className="text-[13px] text-ink-2">Belum ada link di: {empties.map((t) => t.label).join(", ")}. Tambahkan dari panel detail item di Timeline.</p>}
      {filled.map(({ t, withLinks, label }) => {
        return (
          <section key={t.id} className="card space-y-5">
            <h2 className="section-band">{label}</h2>
            {withLinks.map((i) => (
              <div key={i.id} className="space-y-2">
                <h3 className={`text-sm font-semibold ${i.parentId ? "ps-3" : ""}`}>{i.name}</h3>
                <AttachmentList attachments={of("schedule_item", i.id)} target={{ type: "schedule_item", id: i.id }} labelOptions={LINK_LABELS} {...common} />
              </div>
            ))}
          </section>
        );
      })}
    </>
  );
}
