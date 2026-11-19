"use client";

import Link from "next/link";

export function PrintActions({ backHref, backLabel = "Kembali ke timeline" }: { backHref: string; backLabel?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 print:hidden">
      <button type="button" className="btn" onClick={() => window.print()}>Cetak / simpan PDF</button>
      <Link href={backHref} className="text-sm text-accent">{backLabel}</Link>
    </div>
  );
}
