import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db/client";
import { sessions, users } from "@/db/schema";
import { verifyPassword } from "./password";

const COOKIE = "ps_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const sha = (token: string) => createHash("sha256").update(token).digest("hex");

/** Returns false on bad credentials; sets the session cookie on success. */
export async function signIn(email: string, password: string): Promise<boolean> {
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
  if (!user || !(await verifyPassword(password, user.passwordHash))) return false;
  const token = randomBytes(32).toString("base64url");
  await db.insert(sessions).values({ tokenHash: sha(token), userId: user.id, expiresAt: new Date(Date.now() + MAX_AGE * 1000) });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
  return true;
}

export async function signOut(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) await (await getDb()).delete(sessions).where(eq(sessions.tokenHash, sha(token)));
  store.delete(COOKIE);
}

export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const [row] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha(token)), gt(sessions.expiresAt, new Date())));
  return row ?? null;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  return user;
}
