import { generateKeyPairSync, verify } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { budgetInvoices, budgetScopes, budgetVendors, notifications, pushSubscriptions, scheduleItems } from "@/db/schema";
import { authorized, isPushEndpoint, listUnread, markAllRead, notify, runDaily, subscribe, unsubscribe } from "@/lib/push/service";
import { sendPing, vapidJwt } from "@/lib/push/vapid";
import * as rv from "@/lib/review/service";
import { addDays } from "@/lib/schedule/dates";
import * as sch from "@/lib/schedule/service";
import * as s from "@/lib/services";

const TODAY = "2027-03-10";
const kp = generateKeyPairSync("ec", { namedCurve: "P-256" });
const jwk = kp.privateKey.export({ format: "jwk" });
const PUB = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x!, "base64url"), Buffer.from(jwk.y!, "base64url")]).toString("base64url");
const PRIV = jwk.d!;

describe("web push + notifications", () => {
  let db: Db, sup: string, asst: string, projectId: string, other: string, stone: string, tok: string;
  const fake = (status: number) => vi.fn(async () => new Response(null, { status }));

  beforeAll(async () => {
    process.env.VAPID_PUBLIC_KEY = PUB; process.env.VAPID_PRIVATE_KEY = PRIV; process.env.VAPID_SUBJECT = "mailto:t@x.id";
    db = await createPgliteDb();
    sup = (await s.createUser(db, { name: "Sup", email: "sup@x.id", password: "password1" })).id;
    other = (await s.createUser(db, { name: "Out", email: "out@x.id", password: "password1" })).id;
    projectId = (await s.createProject(db, sup, { name: "Film", productionType: "feature_theatrical", platforms: [], unitCount: null })).id;
    await s.addMember(db, sup, projectId, { email: "asst@x.id", role: "assistant", name: "Asst", password: "password1" });
    asst = (await s.listMembers(db, projectId)).find((m) => m.role === "assistant")!.userId;
    await sch.addTrack(db, sup, projectId, { name: "", template: "feature", startDate: "2027-03-01" });
    const items = (await sch.getSchedule(db, projectId, { includeInternal: true })).tracks[0].items;
    stone = items.filter((i) => i.parentId)[0].id;
    await db.update(scheduleItems).set({ dueDate: addDays(TODAY, 1), status: "in_progress" }).where(eq(scheduleItems.id, stone));
    tok = (await rv.createReviewerLink(db, sup, projectId, { name: "Ana", role: "Sutradara", itemIds: [stone] })).token;
  });

  it("dedupe: same key twice gives one row, one ping", async () => {
    const f = fake(201);
    await subscribe(db, sup, { endpoint: "https://push.example/a", keys: { p256dh: "k", auth: "a" } });
    const row = { userId: sup, projectId, kind: "check" as const, title: "T", body: "B", url: "/admin", dedupeKey: "dup:1" };
    expect(await notify(db, [row], f)).toBe(1);
    expect(await notify(db, [row], f)).toBe(0);
    expect(f).toHaveBeenCalledTimes(1);
    expect((await db.select().from(notifications).where(eq(notifications.dedupeKey, "dup:1"))).length).toBe(1);
  });

  it("subscribe is idempotent per endpoint; unsubscribe only removes own", async () => {
    await subscribe(db, sup, { endpoint: "https://push.example/a", keys: { p256dh: "k2", auth: "a" } });
    expect((await db.select().from(pushSubscriptions)).length).toBe(1);
    await unsubscribe(db, other, "https://push.example/a");
    expect((await db.select().from(pushSubscriptions)).length).toBe(1);
    await unsubscribe(db, sup, "https://push.example/a");
    expect((await db.select().from(pushSubscriptions)).length).toBe(0);
  });

  it("only known push hosts over https are accepted", () => {
    for (const ok of ["https://fcm.googleapis.com/fcm/send/x", "https://updates.push.services.mozilla.com/wpush/v2/x", "https://wns2-par02p.notify.windows.com/w/?token=x", "https://web.push.apple.com/x", "https://api.push.apple.com/3/device/x"]) expect(isPushEndpoint(ok)).toBe(true);
    for (const bad of ["http://fcm.googleapis.com/x", "https://evil.example/x", "https://fcm.googleapis.com.evil.example/x", "https://127.0.0.1/x", "https://notpush.apple.com.evil.io/x", "nope"]) expect(isPushEndpoint(bad)).toBe(false);
  });

  it("an endpoint is never rebound to another user, and each user keeps at most 10 devices", async () => {
    await db.delete(pushSubscriptions);
    await subscribe(db, sup, { endpoint: "https://push.example/own", keys: { p256dh: "k", auth: "a" } });
    await subscribe(db, other, { endpoint: "https://push.example/own", keys: { p256dh: "z", auth: "z" } });
    const rows = await db.select().from(pushSubscriptions);
    expect(rows.map((r) => r.userId)).toEqual([other]);
    for (let i = 0; i < 12; i++) await subscribe(db, sup, { endpoint: `https://push.example/d${i}`, keys: { p256dh: "k", auth: "a" } });
    const mine = (await db.select().from(pushSubscriptions)).filter((r) => r.userId === sup).map((r) => r.endpoint);
    expect(mine.length).toBe(10);
    expect(mine).toContain("https://push.example/d11");
    expect(mine).not.toContain("https://push.example/d0");
    await db.delete(pushSubscriptions);
  });

  it("deletes a subscription on 410 and 404, keeps it on 500", async () => {
    for (const [status, left] of [[410, 0], [404, 0], [500, 1]] as const) {
      await db.delete(pushSubscriptions);
      await subscribe(db, sup, { endpoint: "https://push.example/b", keys: { p256dh: "k", auth: "a" } });
      await notify(db, [{ userId: sup, projectId, kind: "check", title: "T", url: "/", dedupeKey: `gone:${status}` }], fake(status));
      expect((await db.select().from(pushSubscriptions)).length).toBe(left);
    }
    await db.delete(pushSubscriptions);
  });

  it("VAPID JWT verifies with the public key; request headers", async () => {
    const jwt = vapidJwt("https://fcm.googleapis.com/fcm/send/xyz", "mailto:t@x.id", PUB, PRIV, 1_800_000_000_000);
    const [h, b, sig] = jwt.split(".");
    expect(JSON.parse(Buffer.from(b, "base64url").toString())).toMatchObject({ aud: "https://fcm.googleapis.com", sub: "mailto:t@x.id" });
    expect(verify("sha256", Buffer.from(`${h}.${b}`), { key: kp.publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url"))).toBe(true);
    const f = fake(201);
    await sendPing({ endpoint: "https://push.example/c" }, f);
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    const hd = init.headers as Record<string, string>;
    expect(hd).toMatchObject({ TTL: "86400", Urgency: "normal" });
    expect(hd.Authorization).toMatch(new RegExp(`^vapid t=\\S+\\.\\S+\\.\\S+, k=${PUB}$`));
  });

  it("without VAPID keys nothing is sent and nothing throws", async () => {
    const [a, b] = [process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY];
    delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY;
    const f = fake(201);
    expect(await sendPing({ endpoint: "https://x" }, f)).toBe(0);
    expect(f).not.toHaveBeenCalled();
    process.env.VAPID_PUBLIC_KEY = a; process.env.VAPID_PRIVATE_KEY = b;
  });

  it("reviewer feedback notifies supervisors only, with no comment text", async () => {
    await rv.submitReviewerFeedback(db, tok, stone, "RAHASIA-ISI-KOMENTAR perbaiki warna");
    await vi.waitFor(async () => expect((await listUnread(db, sup)).some((n) => n.kind === "review_comment")).toBe(true));
    const n = (await listUnread(db, sup)).find((x) => x.kind === "review_comment")!;
    expect(`${n.title} ${n.body}`).not.toMatch(/RAHASIA|warna/);
    expect((await listUnread(db, asst)).some((x) => x.kind === "review_comment")).toBe(false);
  });

  it("daily cron: deadlines to members, invoices to budget readers with no amounts, idempotent", async () => {
    const [v] = await db.insert(budgetVendors).values({ projectId, name: "Studio Grading" }).returning();
    const [sc] = await db.insert(budgetScopes).values({ projectId, name: "Grading" }).returning();
    await db.insert(budgetInvoices).values({ projectId, scopeId: sc.id, vendorId: v.id, termin: "Termin 2", dueDate: TODAY, subtotal: 987654321, status: "received" });
    const made = await runDaily(db, TODAY, fake(201));
    expect(made).toBeGreaterThan(0);
    expect(await runDaily(db, TODAY, fake(201))).toBe(0);
    const all = await db.select().from(notifications);
    const inv = all.filter((n) => n.kind === "invoice_due");
    expect(inv.length).toBe(2); // supervisor + assistant both have budget.view
    expect(inv[0].body).toBe("Studio Grading · Termin 2");
    for (const n of all) expect(`${n.title} ${n.body}`).not.toMatch(/987|654|Rp/);
    expect(all.filter((n) => n.kind === "deadline").length).toBeGreaterThanOrEqual(2);
  });

  it("users only see their own notifications; markAllRead by kind", async () => {
    expect(await listUnread(db, other)).toEqual([]);
    await markAllRead(db, sup, "check");
    expect((await listUnread(db, sup)).some((n) => n.kind === "check")).toBe(false);
    expect((await listUnread(db, sup)).length).toBeGreaterThan(0);
    await markAllRead(db, sup);
    expect(await listUnread(db, sup)).toEqual([]);
    expect((await listUnread(db, asst)).length).toBeGreaterThan(0);
  });

  it("cron auth rejects missing, wrong and unconfigured secrets", () => {
    expect(authorized("Bearer s3cret", "s3cret")).toBe(true);
    expect(authorized("Bearer wrong!", "s3cret")).toBe(false);
    expect(authorized("Bearer s3cret", undefined)).toBe(false);
    expect(authorized(null, "s3cret")).toBe(false);
  });
});
