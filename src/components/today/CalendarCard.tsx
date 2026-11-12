"use client";

import { useState, useTransition } from "react";
import { regenerateCalendarLink } from "@/app/admin/today-actions";
import { CopyButton } from "../ui/controls";
import { useToast } from "../ui/toast";

export function CalendarCard({ slug, origin, initialToken }: { slug: string; origin: string; initialToken: string }) {
  const toast = useToast();
  const [token, setToken] = useState(initialToken);
  const [busy, start] = useTransition();
  const url = `${origin}/cal/${token}.ics`;
  const regenerate = () => {
    if (!window.confirm("Buat ulang link kalender? Link lama berhenti berfungsi dan kalender yang sudah berlangganan perlu diganti.")) return;
    start(async () => {
      const r = await regenerateCalendarLink(slug);
      if (r.ok) { setToken(r.token); toast({ message: "Link kalender dibuat ulang." }); } else toast({ message: r.error, tone: "error" });
    });
  };
  return (
    <section className="card min-w-0 space-y-3 print:hidden">
      <div>
        <h2>Langganan kalender</h2>
        <p className="muted mt-1 text-[13px]">Link pribadi untuk Anda. Jangan dibagikan: siapa pun yang memegangnya bisa melihat jadwal project, termasuk item internal.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate bg-raised px-2 py-1.5 font-mono text-xs">{url}</code>
        <CopyButton text={url} label="Salin link" />
        <button type="button" className="btn-danger" disabled={busy} onClick={regenerate}>Buat ulang link</button>
      </div>
      <ul className="muted list-disc space-y-1 pl-5 text-[13px]">
        <li>iPhone / Mac: Kalender → Tambah Kalender Langganan, lalu tempel link.</li>
        <li>Google Calendar: Kalender lain → Dari URL, lalu tempel link.</li>
        <li>Google hanya memperbarui kalender langganan setiap beberapa jam, jadi perubahan jadwal tidak langsung muncul.</li>
      </ul>
    </section>
  );
}
