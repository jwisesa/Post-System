import { INT_EXTS, placeOf, TIMES_OF_DAY, type ParsedCharacter } from "./types";

export type AggScene = { number: string; intExt: string; location: string; timeOfDay: string; pageStart: number; pageEnd: number; estSeconds: number; characters: ParsedCharacter[] };

export type CharacterAgg = { name: string; scenes: number; blocks: number; sceneNumbers: string[] };
export type LocationAgg = { place: string; scenes: number; seconds: number; sceneNumbers: string[] };

/** Totals, characters and locations (with the scenes they appear in) for a script. Input is in script order. */
export function aggregate(scenes: AggScene[], pages: number) {
  const chars = new Map<string, CharacterAgg>();
  const locs = new Map<string, LocationAgg>();
  const intExt: Record<string, number> = Object.fromEntries([...INT_EXTS, ""].map((k) => [k, 0]));
  const timeOfDay: Record<string, number> = Object.fromEntries([...TIMES_OF_DAY, ""].map((k) => [k, 0]));
  let totalSeconds = 0, blocks = 0;
  for (const s of scenes) {
    totalSeconds += s.estSeconds;
    intExt[s.intExt] = (intExt[s.intExt] ?? 0) + 1;
    timeOfDay[s.timeOfDay] = (timeOfDay[s.timeOfDay] ?? 0) + 1;
    const place = placeOf(s.location) || "(tanpa lokasi)";
    const l = locs.get(place) ?? { place, scenes: 0, seconds: 0, sceneNumbers: [] };
    l.scenes++; l.seconds += s.estSeconds; l.sceneNumbers.push(s.number);
    locs.set(place, l);
    for (const c of s.characters) {
      const a = chars.get(c.name) ?? { name: c.name, scenes: 0, blocks: 0, sceneNumbers: [] };
      a.blocks += c.blocks; blocks += c.blocks;
      if (!a.sceneNumbers.includes(s.number)) { a.scenes++; a.sceneNumbers.push(s.number); }
      chars.set(c.name, a);
    }
  }
  const byName = <T extends { scenes: number }>(key: (x: T) => string) => (a: T, b: T) => b.scenes - a.scenes || key(a).localeCompare(key(b), "id");
  return {
    totalScenes: scenes.length, pages, totalSeconds, dialogueBlocks: blocks, intExt, timeOfDay,
    day: timeOfDay.PAGI + timeOfDay.SIANG + timeOfDay.SORE, night: timeOfDay.MALAM + timeOfDay.SUBUH,
    characters: [...chars.values()].sort((a, b) => b.blocks - a.blocks || a.name.localeCompare(b.name, "id")),
    locations: [...locs.values()].sort(byName<LocationAgg>((x) => x.place)),
  };
}
export type ScriptAggregate = ReturnType<typeof aggregate>;
