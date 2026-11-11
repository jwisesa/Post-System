import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { can, ForbiddenError } from "@/lib/auth/permissions";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import * as s from "@/lib/services";

let db: Db;
let sup: string, asst: string, outsider: string, projectId: string, slug: string;

const contact = (groupId: string, name: string, internal = false): s.ContactInput => ({
  groupId, name, jobTitle: "", company: "", email: "", phone: "", isPic: false, isContact: false, needsAccess: false, internal, notes: "",
});

beforeAll(async () => {
  db = await createPgliteDb();
  sup = (await s.createUser(db, { name: "Sup", email: "sup@x.id", password: "password1" })).id;
  outsider = (await s.createUser(db, { name: "Out", email: "out@x.id", password: "password1" })).id;
  const p = await s.createProject(db, sup, { name: "Film Satu", productionType: "feature_theatrical", platforms: ["Bioskop"], unitCount: 5 });
  projectId = p.id;
  slug = p.slug;
  await s.addMember(db, sup, projectId, { email: "asst@x.id", role: "assistant", name: "Asst", password: "password1" });
  asst = (await s.listMembers(db, projectId)).find((m) => m.role === "assistant")!.userId;
});

describe("permissions", () => {
  it("role matrix", () => {
    expect(can("supervisor", "access.manage")).toBe(true);
    expect(can("assistant", "team.edit")).toBe(true);
    expect(can("assistant", "tech.edit")).toBe(false);
    expect(can("assistant", "access.manage")).toBe(false);
    expect(can(null, "project.view")).toBe(false);
  });

  it("password hashing round-trips", async () => {
    const h = await hashPassword("rahasia123");
    expect(await verifyPassword("rahasia123", h)).toBe(true);
    expect(await verifyPassword("salah", h)).toBe(false);
  });
});

describe("projects", () => {
  it("creator is supervisor; tech spec and team groups are seeded", async () => {
    expect(await s.getRole(db, sup, projectId)).toBe("supervisor");
    expect((await s.getTechSpec(db, projectId)).frameRate).toBe("24");
    expect((await s.getTeam(db, projectId, { includeInternal: true })).length).toBeGreaterThan(5);
  });

  it("non-members cannot see the project", async () => {
    expect(await s.getProjectForUser(db, outsider, slug)).toBeNull();
    expect(await s.listProjects(db, outsider)).toHaveLength(0);
    expect((await s.getProjectForUser(db, asst, slug))?.role).toBe("assistant");
  });

  it("duplicate names get distinct slugs", async () => {
    const p2 = await s.createProject(db, outsider, { name: "Film Satu", productionType: "digital_ad", platforms: [], unitCount: null });
    expect(p2.slug).toBe("film-satu-2");
  });
});

describe("technical page", () => {
  it("supervisor edit is saved and logged with a field-level diff", async () => {
    const n = await s.updateTechSpec(db, sup, projectId, { frameRate: "25", bogus: "x" }, "permintaan distributor");
    expect(n).toBeGreaterThan(0);
    const spec = await s.getTechSpec(db, projectId);
    expect(spec.frameRate).toBe("25");
    expect(spec).not.toHaveProperty("bogus");
    const [{ entry, userName }] = await s.listActivity(db, projectId);
    expect(entry.entity).toBe("tech_spec");
    expect((entry.before as Record<string, string>).frameRate).toBe("24");
    expect((entry.after as Record<string, string>).frameRate).toBe("25");
    expect(entry.reason).toBe("permintaan distributor");
    expect(userName).toBe("Sup");
  });

  it("no-op save writes no log entry", async () => {
    const before = (await s.listActivity(db, projectId)).length;
    expect(await s.updateTechSpec(db, sup, projectId, await s.getTechSpec(db, projectId))).toBe(0);
    expect((await s.listActivity(db, projectId)).length).toBe(before);
  });

  it("assistant and outsider are rejected", async () => {
    await expect(s.updateTechSpec(db, asst, projectId, { frameRate: "30" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(s.updateTechSpec(db, outsider, projectId, { frameRate: "30" })).rejects.toBeInstanceOf(ForbiddenError);
    expect((await s.getTechSpec(db, projectId)).frameRate).toBe("25");
  });
});

describe("team, share links, viewer", () => {
  it("assistant can edit team but not access; internal contacts never reach viewers", async () => {
    const [g] = await s.getTeam(db, projectId, { includeInternal: true });
    await s.addContact(db, asst, projectId, contact(g.id, "Publik"));
    await s.addContact(db, asst, projectId, contact(g.id, "Rahasia", true));
    await expect(s.addContact(db, outsider, projectId, contact(g.id, "X"))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(s.createShareLink(db, asst, projectId, "x")).rejects.toBeInstanceOf(ForbiddenError);

    const link = await s.createShareLink(db, sup, projectId, "Director");
    const view = await s.getViewerData(db, link.token);
    const names = view!.team.flatMap((t) => t.contacts.map((c) => c.name));
    expect(names).toContain("Publik");
    expect(names).not.toContain("Rahasia");
    expect(view!.techSpec.frameRate).toBe("25");

    await s.revokeShareLink(db, sup, projectId, link.id);
    expect(await s.getViewerData(db, link.token)).toBeNull();
    expect(await s.getViewerData(db, "tidak-ada")).toBeNull();
  });

  it("contacts cannot be attached to another project's group", async () => {
    const other = await s.createProject(db, outsider, { name: "Lain", productionType: "web_series", platforms: [], unitCount: null });
    const [g] = await s.getTeam(db, other.id, { includeInternal: true });
    await expect(s.addContact(db, sup, projectId, contact(g.id, "Nyasar"))).rejects.toBeInstanceOf(s.InputError);
  });

  it("every mutation is attributed in the change log", async () => {
    const log = await s.listActivity(db, projectId);
    expect(log.every((l) => l.userName)).toBe(true);
    expect(new Set(log.map((l) => l.entry.entity))).toEqual(new Set(["project", "member", "tech_spec", "team_contact", "share_link"]));
  });
});
