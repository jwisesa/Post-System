// Web Push without a dependency: payload-less pushes signed with a VAPID JWT (ES256).
// The push only wakes the service worker (public/sw.js), which then loads /api/push/inbox with the session cookie.
//
// Cara mengaktifkan (plain Indonesian):
//  1. Jalankan `node scripts/gen-vapid.mjs`, salin tiga baris hasilnya ke .env.local (lokal) dan Environment Variables Vercel:
//     VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:email-anda@contoh.id).
//  2. Isi CRON_SECRET (teks acak panjang) di Vercel supaya pengingat harian (vercel.json, 08:00 WIB, sekali sehari = batas paket Hobby) berjalan.
//  3. Deploy ulang. Di menu pengguna tekan "Aktifkan notifikasi di perangkat ini" dan izinkan.
//  4. iPhone: buka situs di Safari, Share -> Add to Home Screen (iOS 16.4+), buka dari ikon itu, baru aktifkan.
// Tanpa kunci VAPID, tombol aktifkan tidak muncul dan tidak ada error; kotak masuk (lonceng) tetap jalan.
//
// ponytail: if Safari on a real device rejects empty pushes, swap sendPing for the `web-push` dependency (encrypted payload).
import { createPrivateKey, sign } from "node:crypto";

export type PushTarget = { endpoint: string };
type Fetch = typeof fetch;

export const vapidConfigured = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** JWT for the push service of `endpoint`. publicKey/privateKey are base64url (65-byte point / 32-byte scalar). */
export function vapidJwt(endpoint: string, subject: string, publicKey: string, privateKey: string, now = Date.now()) {
  const pub = Buffer.from(publicKey, "base64url");
  const key = createPrivateKey({
    key: { kty: "EC", crv: "P-256", d: privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
    format: "jwk",
  });
  const head = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const body = b64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject }));
  const sig = sign("sha256", Buffer.from(`${head}.${body}`), { key, dsaEncoding: "ieee-p1363" });
  return `${head}.${body}.${b64u(sig)}`;
}

/** Sends an empty push. Returns the HTTP status; 404/410 mean the subscription is dead. 0 = not configured or network error. */
export async function sendPing(t: PushTarget, f: Fetch = fetch): Promise<number> {
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return 0;
  try {
    const jwt = vapidJwt(t.endpoint, process.env.VAPID_SUBJECT || "mailto:admin@example.com", pub, priv);
    const res = await f(t.endpoint, { method: "POST", headers: { TTL: "86400", Urgency: "normal", Authorization: `vapid t=${jwt}, k=${pub}`, "Content-Length": "0" }, signal: AbortSignal.timeout(5000) });
    return res.status;
  } catch {
    return 0;
  }
}
