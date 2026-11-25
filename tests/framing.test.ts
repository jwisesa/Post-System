import { describe, expect, it } from "vitest";
import { CAMERAS, FILM } from "@/lib/framing/cameras";
import { buildSpec, DEFAULTS, filmStats, framing, parseState, safety, serialize } from "@/lib/framing/frame";

describe("framing math", () => {
  it("16:9 in a 3:2 sensor crops height", () => {
    const r = framing(4608, 3164, 16 / 9);
    expect(r.w).toBe(4608); expect(r.h).toBe(2592); expect(r.y).toBe(286);
  });
  it("2.39 in 16:9 sensor keeps width", () => {
    const r = framing(3840, 2160, 2.39);
    expect(r.w).toBe(3840); expect(r.h).toBe(1606);
  });
  it("wide ratio on tall sensor limited by height with squeeze", () => {
    const r = framing(4448, 3096, 2.39, 2); // desqueezed 8896x3096 = 2.87 > 2.39
    expect(r.h).toBe(3096); expect(r.w).toBe(Math.round((3096 * 2.39) / 2 / 2) * 2);
  });
  it("full sensor and safety", () => {
    expect(framing(100, 50, 0)).toEqual({ x: 0, y: 0, w: 100, h: 50 });
    const s = safety({ x: 0, y: 0, w: 1000, h: 500 }, 90);
    expect(s).toEqual({ x: 50, y: 25, w: 900, h: 450 });
  });
});
describe("film", () => {
  it("4-perf Academy 4K at 24fps", () => {
    const f = FILM[0], st = filmStats(f, f.gates[1], 4096, 24);
    expect(st.w).toBe(4096); expect(st.h).toBe(2986);
    expect(st.ftPerMin).toBe(90);
    expect(st.r1000.min).toBeCloseTo(11.11, 1);
    expect(st.bytes).toBe(4096 * 2986 * 4);
  });
  it("3-perf and super16 run lengths", () => {
    expect(filmStats(FILM[1], FILM[1].gates[0], 2048, 24).ftPerMin).toBeCloseTo(67.5);
    expect(filmStats(FILM[3], FILM[3].gates[1], 2048, 24).ftPerMin).toBe(36);
    expect(filmStats(FILM[4], FILM[4].gates[0], 2048, 24).ftPerMin).toBeCloseTo(112.5);
  });
});
describe("data and state", () => {
  it("every camera mode has sources", () => {
    for (const c of CAMERAS) { expect(c.source.url).toMatch(/^https:/); for (const m of c.modes) { expect(m.source.accessed).toBe("2026-11-26"); expect(m.px[0] / m.px[1]).toBeCloseTo(m.mm[0] / m.mm[1], 1); } }
  });
  it("roundtrips URL state and builds spec", () => {
    const s = { ...DEFAULTS, cam: "arri-mini-lf", mode: "169", sq: "2", title: "Uji" };
    const back = parseState(Object.fromEntries(new URLSearchParams(serialize(s))));
    expect(back).toEqual(s);
    const spec = buildSpec(s); expect(spec.W).toBe(3840); expect(spec.squeeze).toBe(2);
  });
});
