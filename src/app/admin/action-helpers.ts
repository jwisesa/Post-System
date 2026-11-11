import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { ForbiddenError } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import * as s from "@/lib/services";

export const str = (f: FormData, k: string) => String(f.get(k) ?? "");
export const flag = (f: FormData, k: string) => f.get(k) === "on";

/** Signed-in user plus the project named by the form's hidden "slug" field. */
export async function ctx(f: FormData) {
  const user = await requireUser();
  const db = await getDb();
  const row = await s.getProjectForUser(db, user.id, str(f, "slug"));
  if (!row) notFound();
  return { db, user, project: row.project };
}

export const isExpected = (e: unknown): e is Error => e instanceof s.InputError || e instanceof ForbiddenError;

/** Runs a mutation, then returns to `path`; expected failures come back as ?error=. */
export async function finish(path: string, fn: () => Promise<unknown>): Promise<never> {
  let error = "";
  try {
    await fn();
  } catch (e) {
    if (!isExpected(e)) throw e;
    error = e.message;
  }
  revalidatePath(path);
  redirect(error ? `${path}?error=${encodeURIComponent(error)}` : path);
}
