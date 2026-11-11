export type Role = "supervisor" | "assistant";

export type Action =
  | "project.view"
  | "project.edit"
  | "tech.edit"
  | "team.edit"
  | "access.manage"
  | "schedule.edit" // dates, structure, dependencies, baseline
  | "schedule.status" // status and notes only
  | "asset.edit" // links and versions
  | "asset.approve" // version approval status
  | "comment.add";

const ASSISTANT: ReadonlySet<Action> = new Set(["project.view", "team.edit", "schedule.status", "asset.edit", "comment.add"]);

/** role = null means "not a member of this project". */
export function can(role: Role | null, action: Action): boolean {
  if (role === "supervisor") return true;
  if (role === "assistant") return ASSISTANT.has(action);
  return false;
}

export class ForbiddenError extends Error {
  constructor(action: Action) {
    super(`Tidak punya akses: ${action}`);
    this.name = "ForbiddenError";
  }
}

export function assertCan(role: Role | null, action: Action): void {
  if (!can(role, action)) throw new ForbiddenError(action);
}
