// Reversible name merging, applied at read time. No imports from the db: safe in client components.
import { placeOf, type ParsedCharacter } from "./types";

export type AliasKind = "character" | "location";
export type Alias = { kind: string; fromName: string; toName: string };
export const MAX_ALIASES = 500;
export const MAX_ALIAS_NAME = 60;

/** Rewrites character names and the place part of the location. Scene data in the db is untouched. */
export function applyAliases<T extends { location: string; characters: ParsedCharacter[] }>(scenes: T[], aliases: Alias[]): T[] {
  if (!aliases.length) return scenes;
  const chars = new Map(aliases.filter((a) => a.kind === "character").map((a) => [a.fromName, a.toName]));
  const locs = new Map(aliases.filter((a) => a.kind === "location").map((a) => [a.fromName, a.toName]));
  return scenes.map((s) => {
    const place = placeOf(s.location), to = locs.get(place);
    const merged = new Map<string, number>();
    for (const c of s.characters) { const n = chars.get(c.name) ?? c.name; merged.set(n, (merged.get(n) ?? 0) + c.blocks); }
    return { ...s, location: to && place ? to + s.location.slice(place.length) : s.location, characters: [...merged].map(([name, blocks]) => ({ name, blocks })) };
  });
}

/** Comparison key: case, punctuation, trailing (V.O.)/(O.S.) and look-alike l/I/1 (and 0/O) ignored. */
export function nameKey(name: string, kind: AliasKind = "character") {
  const base = kind === "location" ? placeOf(name) : name;
  return base.toUpperCase().replace(/\s*\((?:V\.?O\.?|O\.?S\.?|O\.?C\.?|CONT'?D\.?)\)\s*$/, "").replace(/[1L]/g, "I").replace(/0/g, "O").replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function lev1(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const x = a.slice(i), y = b.slice(i);
  return x.slice(1) === y.slice(1) || x.slice(1) === y || x === y.slice(1);
}

/** Likely duplicates: [bigger, smaller] pairs, most frequent first. At most 20. */
export function suggestPairs(items: { name: string; scenes: number }[], kind: AliasKind = "character"): [string, string][] {
  const keyed = items.map((x) => ({ ...x, key: nameKey(x.name, kind) })).sort((a, b) => b.scenes - a.scenes || a.name.localeCompare(b.name));
  const out: [string, string][] = [];
  for (let i = 0; i < keyed.length; i++) for (let j = i + 1; j < keyed.length; j++) {
    const a = keyed[i], b = keyed[j];
    const same = a.key === b.key;
    const close = !same && a.key.length >= 5 && b.key.length >= 5 && lev1(a.key, b.key);
    const prefix = kind === "location" && !same && (a.key.startsWith(b.key + " ") || b.key.startsWith(a.key + " "));
    if (same || close || prefix) out.push([a.name, b.name]);
  }
  return out.slice(0, 20);
}
