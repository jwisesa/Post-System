import { notFound } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db/client";
import { requireUser } from "./auth/session";
import { getProjectForUser } from "./services";

/** Signed-in user + the project they are a member of, or 404. */
export const loadProject = cache(async (slug: string) => {
  const user = await requireUser();
  const db = await getDb();
  const row = await getProjectForUser(db, user.id, slug);
  if (!row) notFound();
  return { db, user, project: row.project, role: row.role };
});
