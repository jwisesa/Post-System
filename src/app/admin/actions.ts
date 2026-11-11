"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import type { Role } from "@/lib/auth/permissions";
import { requireUser, signIn, signOut } from "@/lib/auth/session";
import * as s from "@/lib/services";
import { ctx, finish, flag, str } from "./action-helpers";
import { PLATFORMS, PRODUCTION_TYPES, TECH_FIELDS } from "@/lib/tech-spec/schema";

function projectInput(f: FormData): s.ProjectInput {
  const type = str(f, "productionType");
  return {
    name: str(f, "name"),
    productionType: PRODUCTION_TYPES.some((t) => t.value === type) ? type : PRODUCTION_TYPES[0].value,
    platforms: f.getAll("platforms").map(String).filter((p) => PLATFORMS.includes(p)),
    unitCount: Number(str(f, "unitCount")) || null,
  };
}

function contactInput(f: FormData): s.ContactInput {
  return {
    groupId: str(f, "groupId"), name: str(f, "name"), jobTitle: str(f, "jobTitle"), company: str(f, "company"),
    email: str(f, "email"), phone: str(f, "phone"), notes: str(f, "notes"),
    isPic: flag(f, "isPic"), isContact: flag(f, "isContact"), needsAccess: flag(f, "needsAccess"), internal: flag(f, "internal"),
  };
}

export async function loginAction(f: FormData) {
  const ok = await signIn(str(f, "email"), str(f, "password"));
  redirect(ok ? "/admin" : "/admin/login?error=1");
}

export async function logoutAction() {
  await signOut();
  redirect("/admin/login");
}

export async function createProjectAction(f: FormData) {
  const user = await requireUser();
  const db = await getDb();
  let target: string;
  try {
    target = `/admin/p/${(await s.createProject(db, user.id, projectInput(f))).slug}`;
  } catch (e) {
    if (!(e instanceof s.InputError)) throw e;
    target = `/admin?error=${encodeURIComponent(e.message)}`;
  }
  revalidatePath("/admin");
  redirect(target);
}

export async function updateProjectAction(f: FormData) {
  const { db, user, project } = await ctx(f);
  await finish(`/admin/p/${project.slug}`, () => s.updateProject(db, user.id, project.id, projectInput(f)));
}

export async function updateTechSpecAction(f: FormData) {
  const { db, user, project } = await ctx(f);
  const data = Object.fromEntries(TECH_FIELDS.map(({ key }) => [key, str(f, key)]));
  await finish(`/admin/p/${project.slug}/technical`, () => s.updateTechSpec(db, user.id, project.id, data, str(f, "reason")));
}

export async function addGroupAction(f: FormData) {
  const { db, user, project } = await ctx(f);
  await finish(`/admin/p/${project.slug}/team`, () => s.addTeamGroup(db, user.id, project.id, str(f, "name")));
}

export async function addContactAction(f: FormData) {
  const { db, user, project } = await ctx(f);
  await finish(`/admin/p/${project.slug}/team`, () => s.addContact(db, user.id, project.id, contactInput(f)));
}

export async function updateContactAction(f: FormData) {
  const { db, user, project } = await ctx(f);
  await finish(`/admin/p/${project.slug}/team`, () => s.updateContact(db, user.id, project.id, str(f, "contactId"), contactInput(f)));
}

export async function deleteContactAction(f: FormData) {
  const { db, user, project } = await ctx(f);
  await finish(`/admin/p/${project.slug}/team`, () => s.deleteContact(db, user.id, project.id, str(f, "contactId")));
}

export async function addMemberAction(f: FormData) {
  const { db, user, project } = await ctx(f);
  const role: Role = str(f, "role") === "supervisor" ? "supervisor" : "assistant";
  await finish(`/admin/p/${project.slug}/access`, () =>
    s.addMember(db, user.id, project.id, { email: str(f, "email"), role, name: str(f, "name"), password: str(f, "password") }),
  );
}

export async function removeMemberAction(f: FormData) {
  const { db, user, project } = await ctx(f);
  await finish(`/admin/p/${project.slug}/access`, () => s.removeMember(db, user.id, project.id, str(f, "userId")));
}

export async function createShareLinkAction(f: FormData) {
  const { db, user, project } = await ctx(f);
  await finish(`/admin/p/${project.slug}/access`, () => s.createShareLink(db, user.id, project.id, str(f, "label")));
}

export async function revokeShareLinkAction(f: FormData) {
  const { db, user, project } = await ctx(f);
  await finish(`/admin/p/${project.slug}/access`, () => s.revokeShareLink(db, user.id, project.id, str(f, "linkId")));
}
