"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { markReadAction } from "@/app/admin/notify-actions";
import { Section } from "./ui/section";

type Finding = { rule: string; severity: "error" | "warn" | "info"; title: string; detail: string; fix: { href: string; label: string } };
const SEVERITIES = [["error", "Error"], ["warn", "Peringatan"], ["info", "Info"]] as const;

const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };
/** keyed by check + a hash of its detail: a finding whose values change reappears */
const keyOf = (f: Finding) => `${f.rule}:${hash(f.title + f.detail)}`;

export function FindingsList({ findings, userId, slug }: { findings: Finding[]; userId: string; slug: string }) {
  const store = `ps.hidden.${userId}.${slug}`;
  const [showAll, setShowAll] = useState(false);
  const raw = useSyncExternalStore(
    (cb) => { window.addEventListener("storage", cb); window.addEventListener("ps-hidden", cb); return () => { window.removeEventListener("storage", cb); window.removeEventListener("ps-hidden", cb); }; },
    () => localStorage.getItem(store) ?? "[]", () => "[]");
  const hidden: string[] = (() => { try { return JSON.parse(raw); } catch { return []; } })();
  const save = (next: string[]) => { localStorage.setItem(store, JSON.stringify(next)); window.dispatchEvent(new Event("ps-hidden")); };
  const live = new Set(findings.map(keyOf));
  const gone = hidden.filter((k) => live.has(k));
  const visible = findings.filter((f) => showAll || !gone.includes(keyOf(f)));
  const shown = visible.filter((f) => !gone.includes(keyOf(f)));
  const [cleared, setCleared] = useState(false);
  const clean = async () => {
    await markReadAction("check");
    navigator.serviceWorker?.controller?.postMessage({ type: "clear", kind: "check" });
    window.dispatchEvent(new Event("ps-notify"));
    setCleared(true);
  };
  return (
    <>
      <div className="page-actions" style={{ justifyContent: "flex-start" }}>
        <button type="button" className="btn-secondary" onClick={clean}>{cleared ? "Notifikasi dibersihkan" : "Bersihkan notifikasi"}</button>
        {gone.length > 0 && <button type="button" className="btn-ghost" onClick={() => setShowAll(!showAll)}>{gone.length} disembunyikan · {showAll ? "sembunyikan lagi" : "tampilkan"}</button>}
        {shown.length > 0 && <button type="button" className="btn-secondary" onClick={() => save([...new Set([...gone, ...shown.map(keyOf)])])}>Sembunyikan semua</button>}
      </div>
      {visible.length === 0 && <p className="text-[13px] text-ink-2">{findings.length ? "Semua temuan disembunyikan." : "Tidak ada temuan."}</p>}
      {SEVERITIES.map(([sev, label]) => {
        const rows = visible.filter((f) => f.severity === sev);
        if (!rows.length) return null;
        return (
          <Section key={sev} id={sev} title={label} digest={`${rows.length} temuan`} actions={<span className="section-digest tabular-nums">{rows.length}</span>}>
            <ul className="rows">
              {rows.map((f) => {
                const k = keyOf(f), off = gone.includes(k);
                return (
                  <li key={k} className="py-3" style={off ? { opacity: 0.6 } : undefined}>
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold">{f.title}</div>
                        <p className="text-[13px] text-ink-2">{f.detail}</p>
                        <Link href={f.fix.href} className="text-[13px] font-semibold underline underline-offset-2">{f.fix.label}</Link>
                      </div>
                      <button type="button" className="btn-ghost" onClick={() => save(off ? hidden.filter((x) => x !== k) : [...hidden, k])}>{off ? "Tampilkan" : "Sembunyikan"}</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Section>
        );
      })}
    </>
  );
}
