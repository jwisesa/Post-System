"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { markReadAction } from "@/app/admin/notify-actions";

type Item = { id: string; title: string; body: string; url: string };
type PushState = "unsupported" | "off" | "on" | "blocked";

const keyBytes = (b64: string) => Uint8Array.from(atob(b64.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const supported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export function NotifyMenu({ vapidKey }: { vapidKey?: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [push, setPush] = useState<PushState>("unsupported");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/push/inbox", { cache: "no-store" }).catch(() => null);
    if (r?.ok) setItems((await r.json()).notifications);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch of browser/server state
    void load();
    window.addEventListener("ps-notify", load);
    if (!vapidKey || !supported()) return () => window.removeEventListener("ps-notify", load);
    if (Notification.permission === "denied") { setPush("blocked"); return () => window.removeEventListener("ps-notify", load); }
    navigator.serviceWorker.getRegistration("/sw.js").then((r) => r?.pushManager.getSubscription()).then((s) => setPush(s ? "on" : "off")).catch(() => setPush("off"));
    return () => window.removeEventListener("ps-notify", load);
  }, [load, vapidKey]);

  const enable = async () => {
    setBusy(true);
    try {
      if ((await Notification.requestPermission()) !== "granted") { setPush(Notification.permission === "denied" ? "blocked" : "off"); return; }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidKey!) });
      const r = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      setPush(r.ok ? "on" : "off");
    } catch { setPush("off"); } finally { setBusy(false); }
  };
  const disable = async () => {
    setBusy(true);
    try {
      const sub = await (await navigator.serviceWorker.getRegistration("/sw.js"))?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setPush("off");
    } finally { setBusy(false); }
  };
  const readAll = async () => {
    await markReadAction();
    navigator.serviceWorker?.controller?.postMessage({ type: "clear" });
    setItems([]);
  };

  return (
    <details className="relative" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && void load()}>
      <summary className="btn-ghost btn-icon relative cursor-pointer list-none" aria-label={`Notifikasi${items.length ? `, ${items.length} belum dibaca` : ""}`} title="Notifikasi">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
        {items.length > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-semibold leading-4 text-white tabular-nums" data-testid="bell-count">{items.length}</span>}
      </summary>
      <div className="absolute right-0 z-50 text-ink mt-1 w-[min(20rem,calc(100vw-1rem))] space-y-2 rounded-lg border border-line bg-surface p-3 text-left shadow-lg">
        {items.length === 0 ? <p className="text-[13px] text-ink-2">Tidak ada notifikasi baru.</p> : (
          <ul className="max-h-72 space-y-2 overflow-y-auto">
            {items.map((n) => (
              <li key={n.id}><Link href={n.url} className="block text-[13px] text-ink"><span className="block font-semibold">{n.title}</span><span className="block text-ink-2">{n.body}</span></Link></li>
            ))}
          </ul>
        )}
        {items.length > 0 && <button type="button" className="btn-secondary w-full" onClick={readAll}>Tandai semua dibaca</button>}
        {vapidKey && (
          <div className="space-y-1 border-t border-line pt-2 text-[12px] text-ink-2">
            {push === "unsupported" && <p>Notifikasi di perangkat ini belum didukung. Di iPhone, tambahkan aplikasi ke Home Screen lewat Share → Add to Home Screen (iOS 16.4+), lalu buka dari ikonnya.</p>}
            {push === "blocked" && <p>Notifikasi diblokir di pengaturan browser/perangkat. Izinkan dulu, lalu muat ulang.</p>}
            {push === "on" && <><p>Notifikasi di perangkat ini: aktif.</p><button type="button" className="btn-ghost" disabled={busy} onClick={disable}>Matikan di perangkat ini</button></>}
            {push === "off" && <><button type="button" className="btn-secondary w-full" disabled={busy} onClick={enable}>Aktifkan notifikasi di perangkat ini</button><p>iPhone: tambahkan ke Home Screen dulu (Share → Add to Home Screen, iOS 16.4+).</p></>}
          </div>
        )}
      </div>
    </details>
  );
}
