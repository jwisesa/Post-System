"use client";

import { useRouter } from "next/navigation";

export function ScriptVersionSelect({ base, current, options }: { base: string; current?: string; options: { id: string; label: string }[] }) {
  const router = useRouter();
  return (
    <select aria-label="Versi naskah" value={current ?? ""} onChange={(e) => router.push(`${base}?script=${e.target.value}`)} className="max-w-64">
      {!current && <option value="">Pilih versi</option>}
      {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  );
}
