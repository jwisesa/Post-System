"use client";

import { useRouter } from "next/navigation";
import { changeVersionStatus } from "@/app/admin/budget-actions";
import { useToast } from "@/components/ui/toast";
import { NEXT, VERSION_STATUSES, type VersionStatusCode } from "@/lib/budget/catalog";

/** Offers only the moves allowed by NEXT. Undoing an approval asks for a reason. */
export function StatusSelect({ slug, versionId, status }: { slug: string; versionId: string; status: VersionStatusCode }) {
  const toast = useToast();
  const router = useRouter();
  const options = NEXT[status];
  if (!options.length) return <span className="tag">{VERSION_STATUSES[status]}</span>;
  const change = async (to: string) => {
    let note = "";
    if (status === "approved") {
      note = window.prompt("Alasan batal setujui:")?.trim() ?? "";
      if (!note) return;
    }
    const r = await changeVersionStatus(slug, versionId, to, note);
    if (!r.ok) { toast({ message: r.error, tone: "error" }); return; }
    toast({ message: r.picked ? `Disetujui. ${r.vendor} dipilih untuk lingkup ini.` : "Status diubah." });
    router.refresh();
  };
  return (
    <select aria-label="Ubah status" value="" onChange={(e) => e.target.value && change(e.target.value)}>
      <option value="">{VERSION_STATUSES[status]}</option>
      {options.map((o) => <option key={o} value={o}>{VERSION_STATUSES[o]}</option>)}
    </select>
  );
}
