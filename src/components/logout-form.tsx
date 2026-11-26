"use client";

import { logoutAction } from "@/app/admin/actions";

/** Drops this device's push subscription (so the next user of a shared device isn't pinged) before logging out. Never blocks logout. */
async function dropPush() {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const sub = await (await navigator.serviceWorker.getRegistration("/sw.js"))?.pushManager.getSubscription();
    if (!sub) return;
    await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }), signal: AbortSignal.timeout(3000) });
    await sub.unsubscribe();
  } catch {}
}

export function LogoutForm() {
  return <form action={async () => { await dropPush(); await logoutAction(); }}><button className="btn-ghost">Keluar</button></form>;
}
