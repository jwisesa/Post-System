// In-app inbox + web push. Notification text must stay lock-screen safe: no budget amounts, script text or reviewer comment bodies.
import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { after } from "next/server";
import type { Db } from "@/db/client";
import { budgetInvoices, budgetPayments, budgetVendors, notifications, projectMembers, projects, pushSubscriptions, scheduleItems } from "@/db/schema";
import { can } from "../auth/permissions";
import { getChecks } from "../checks/service";
import { invoiceState } from "../budget/rollup";
import { addDays } from "../schedule/dates";
import { sendPing } from "./vapid";

type Fetch = typeof fetch;
export type NotifyRow = typeof notifications.$inferInsert;

export const subscribe = (db: Db, userId: string, s: { endpoint: string; keys: { p256dh: string; auth: string }; userAgent?: string }) =>
  db.insert(pushSubscriptions).values({ userId, endpoint: s.endpoint, keys: s.keys, userAgent: (s.userAgent ?? "").slice(0, 300) })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId, keys: s.keys } });

export const unsubscribe = (db: Db, userId: string, endpoint: string) =>
  db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));

export const listUnread = (db: Db, userId: string, limit = 20) =>
  db.select({ id: notifications.id, kind: notifications.kind, title: notifications.title, body: notifications.body, url: notifications.url, createdAt: notifications.createdAt })
    .from(notifications).where(and(eq(notifications.userId, userId), isNull(notifications.readAt))).orderBy(sql`${notifications.createdAt} desc`).limit(limit);

export async function markAllRead(db: Db, userId: string, kind?: NotifyRow["kind"]) {
  await db.update(notifications).set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt), kind ? eq(notifications.kind, kind) : undefined));
}

/** Inserts (duplicates by dedupe_key are skipped), then pings the devices of the users that got a NEW row. Dead subscriptions (404/410) are deleted. */
export async function notify(db: Db, rows: NotifyRow[], f: Fetch = fetch) {
  if (!rows.length) return 0;
  const fresh = await db.insert(notifications).values(rows).onConflictDoNothing({ target: notifications.dedupeKey }).returning({ userId: notifications.userId });
  const users = [...new Set(fresh.map((r) => r.userId))];
  if (!users.length) return 0;
  const subs = await db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, users));
  await Promise.all(subs.map(async (s) => {
    const status = await sendPing(s, f);
    if (status === 404 || status === 410) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
  }));
  return fresh.length;
}

/** Runs after the response when inside a request; plain background promise otherwise (tests, scripts). Never throws. */
export function afterSafe(fn: () => Promise<unknown>) {
  const run = () => fn().catch((e) => console.error("push notify failed", e));
  try { after(run); } catch { void run(); }
}

const recipients = (db: Db, projectId: string, only?: "supervisor") =>
  db.select({ userId: projectMembers.userId, role: projectMembers.role }).from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), only ? eq(projectMembers.role, only) : undefined));

/** Supervisors hear about reviewer feedback / sign-offs. `key` identifies the event; the text names the milestone only. */
export async function notifyReview(db: Db, projectId: string, key: string, refId: string, title: string, body: string) {
  const [p] = await db.select({ slug: projects.slug }).from(projects).where(eq(projects.id, projectId));
  if (!p) return;
  const sups = await recipients(db, projectId, "supervisor");
  await notify(db, sups.map((m) => ({ userId: m.userId, projectId, kind: "review_comment" as const, refId, title, body, url: `/admin/p/${p.slug}/timeline`, dedupeKey: `${key}:${m.userId}` })));
}

/** Daily reminders. `today` is the Asia/Jakarta date. Safe to run twice: dedupe keys. */
export async function runDaily(db: Db, today: string, f: Fetch = fetch) {
  const days = [1, 3];
  const rows: NotifyRow[] = [];
  const all = await db.select({ id: projects.id, slug: projects.slug, name: projects.name }).from(projects).where(eq(projects.status, "active"));
  for (const p of all) {
    const members = await recipients(db, p.id);
    const due = days.map((d) => addDays(today, d));
    const items = await db.select({ id: scheduleItems.id, name: scheduleItems.name, dueDate: scheduleItems.dueDate }).from(scheduleItems)
      .where(and(eq(scheduleItems.projectId, p.id), inArray(scheduleItems.dueDate, due), sql`${scheduleItems.status} <> 'done'`));
    for (const it of items) {
      const d = due.indexOf(it.dueDate) === 0 ? 1 : 3;
      for (const m of members) rows.push({ userId: m.userId, projectId: p.id, kind: "deadline", refId: it.id, title: `Tenggat ${d === 1 ? "besok" : "3 hari lagi"}: ${it.name}`, body: p.name, url: `/admin/p/${p.slug}/timeline`, dedupeKey: `deadline:${it.id}:${it.dueDate}:${d}:${m.userId}` });
    }
    // Invoices: vendor and termin only, never amounts; budget readers only.
    const budgetMembers = members.filter((m) => can(m.role, "budget.view"));
    if (budgetMembers.length) {
      const invs = await db.select({ i: budgetInvoices, vendor: budgetVendors.name }).from(budgetInvoices).innerJoin(budgetVendors, eq(budgetVendors.id, budgetInvoices.vendorId))
        .where(and(eq(budgetInvoices.projectId, p.id), eq(budgetInvoices.status, "received"), inArray(budgetInvoices.dueDate, [today, addDays(today, 1)])));
      const pays = invs.length ? await db.select().from(budgetPayments).where(eq(budgetPayments.projectId, p.id)) : [];
      for (const { i, vendor } of invs) {
        if (invoiceState(i, pays.filter((x) => x.invoiceId === i.id)).lunas) continue;
        const when = i.dueDate === today ? "hari ini" : "besok";
        for (const m of budgetMembers) rows.push({ userId: m.userId, projectId: p.id, kind: "invoice_due", refId: i.id, title: `Invoice jatuh tempo ${when}`, body: `${vendor}${i.termin ? ` · ${i.termin}` : ""}`, url: `/admin/p/${p.slug}/budget`, dedupeKey: `invoice:${i.id}:${i.dueDate}:${m.userId}` });
      }
    }
    // New Pemeriksaan errors (supervisors; capped so a first run is not a flood).
    const errs = (await getChecks(db, p.id, p.slug, today).catch(() => [])).filter((x) => x.severity === "error").slice(0, 5);
    for (const e of errs) for (const m of members.filter((m) => m.role === "supervisor")) {
      rows.push({ userId: m.userId, projectId: p.id, kind: "check", title: "Pemeriksaan: temuan error", body: `${p.name} · ${e.title}`, url: `/admin/p/${p.slug}/checks`, dedupeKey: `check:${e.rule}:${createHash("sha256").update(p.id + e.title).digest("hex").slice(0, 16)}:${m.userId}` });
    }
  }
  let n = 0;
  for (let k = 0; k < rows.length; k += 200) n += await notify(db, rows.slice(k, k + 200), f);
  return n;
}

/** Constant-time check of "Authorization: Bearer $CRON_SECRET". No secret configured = always 401. */
export function authorized(header: string | null, secret = process.env.CRON_SECRET) {
  if (!secret || !header) return false;
  const a = Buffer.from(header), b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
