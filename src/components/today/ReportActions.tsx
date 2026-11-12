"use client";

import { CopyButton } from "../ui/controls";

export function ReportActions({ summary }: { summary: string }) {
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <button type="button" className="btn" onClick={() => window.print()}>Cetak / simpan PDF</button>
      <CopyButton text={summary} label="Salin ringkasan teks" />
    </div>
  );
}
