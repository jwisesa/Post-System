"use client";

import Link from "next/link";

export function PrintActions({ backHref }: { backHref: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 print:hidden">
      <button type="button" className="btn" onClick={() => window.print()}>Cetak / simpan PDF</button>
      <Link href={backHref} className="text-sm text-accent">Kembali ke timeline</Link>
    </div>
  );
}
