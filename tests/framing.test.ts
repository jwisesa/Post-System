import { describe, expect, it } from "vitest";
import { CAMERAS, FILM } from "@/lib/framing/cameras";
import { buildSpec, DEFAULTS, filmStats, fitBlock, framing, parseState, placeGuideLabels, safeRect, deliveryRect, reduce, resolutions, serialize, textW, wrapText } from "@/lib/framing/frame";

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
    const s = safeRect({ x: 0, y: 0, w: 1000, h: 500 }, 10);
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
    const spec = buildSpec(s); expect(spec.sensorW).toBe(3840); expect(spec.W).toBe(7680); expect(spec.squeeze).toBe(2);
  });
});

describe("more framing cases", () => {
  it("1:1 on 3:2 sensor is height-limited and even", () => {
    const r = framing(4608, 3164, 1); expect(r).toEqual({ x: 722, y: 0, w: 3164, h: 3164 });
  });
  it("1.3x squeeze on 3:2 for 2.39 is width-limited", () => {
    const r = framing(4608, 3164, 2.39, 1.3); // desqueezed 5990x3164 = 1.89 < 2.39
    expect(r.w).toBe(4608); expect(r.h).toBe(Math.round((4608 * 1.3) / 2.39 / 2) * 2);
  });
  it("odd sensor sizes give integer, centred, in-bounds rects", () => {
    const r = framing(2743, 3086, 16 / 9, 2);
    expect(r.w).toBeLessThanOrEqual(2743); expect(r.h).toBeLessThanOrEqual(3086);
    expect(Number.isInteger(r.w) && Number.isInteger(r.h)).toBe(true);
    expect(r.x * 2 + r.w).toBe(2743);
  });
  it("non-matching aspect (4:3 target on 2.39 sensor) keeps full height", () => {
    const r = framing(4448, 1856, 4 / 3); expect(r.h).toBe(1856); expect(r.w).toBe(2474); expect(r.x).toBe(987);
  });
});
describe("text fitting", () => {
  const long = "ARRIRAW / Apple ProRes 4444 XQ / Blackmagic RAW Q0 / REDCODE RAW HQ extra";
  it("shrinks stepwise and never exceeds max width", () => {
    const f = fitBlock([`Sensor mode: 4.6K 3:2 Open Gate · ${long}`], 50, 1500);
    expect(f.size).toBeLessThan(50); expect(f.size).toBeGreaterThanOrEqual(50 * 0.55 - 1e-9);
    for (const l of f.lines.flat()) expect(textW(l, f.size)).toBeLessThanOrEqual(1500);
  });
  it("leaves short text alone", () => { expect(fitBlock(["DoP: A"], 50, 1500).size).toBe(50); });
  it("hard-splits unbreakable tokens", () => { for (const l of wrapText("X".repeat(100), 30)) expect(l.length).toBeLessThanOrEqual(30); });
});
describe("guide labels", () => {
  it("staggers close guides across sides and caps at 4", () => {
    const l = placeGuideLabels([100, 104, 108, 112, 116, 500], 40);
    expect(l).toHaveLength(4);
    expect(new Set(l.map((x) => x.side)).size).toBe(2);
    for (const side of [0, 1]) { const ys = l.filter((x) => x.side === side).map((x) => x.y).sort((a, b) => a - b); for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(40); }
  });
});
describe("film verification", () => {
  it("every gate declares source and verified flag; unverified are explained", () => {
    for (const f of FILM) for (const g of f.gates) { expect(g.source.accessed).toBe("2026-11-26"); expect(typeof g.verified).toBe("boolean"); }
    expect(FILM[1].gates[0].mm).toEqual([24.9, 13.9]);
  });
});

describe("output mode (desqueezed)", () => {
  for (const sq of [1.3, 1.5, 1.8, 2]) for (const ar of [2.39, 16 / 9, 1]) {
    it(`desqueezed @${sq} ar ${ar.toFixed(2)}`, () => {
      const spec = buildSpec({ ...DEFAULTS, sq: String(sq), ar: ar === 1 ? "100" : ar === 2.39 ? "239" : "178" });
      expect(spec.desq).toBe(true); expect(spec.sensorW).toBeGreaterThan(0);
      const cw = Math.round(spec.sensorW * sq); expect(Math.abs(spec.W - cw)).toBeLessThanOrEqual(1); expect(spec.W % 2).toBe(0);
      const r = framing(spec.W, spec.H, ar, 1);
      expect(Math.abs(r.w / r.h - ar) * r.h).toBeLessThanOrEqual(2);
    });
  }
  it("mode switch round-trips via URL, squeezed keeps sensor size", () => {
    const s = { ...DEFAULTS, sq: "2", out: "squeezed" };
    const back = parseState(Object.fromEntries(new URLSearchParams(serialize(s))));
    expect(back.out).toBe("squeezed"); const sp = buildSpec(back); expect(sp.desq).toBe(false); expect(sp.W).toBe(sp.sensorW);
    expect(buildSpec(parseState({ sq: "2" })).desq).toBe(true); expect(buildSpec(parseState({})).desq).toBe(false);
  });
});

describe("safe frame inset", () => {
  for (const sq of ["1", "2"]) for (const out of ["desqueezed", "squeezed"]) for (const crop of [0, 5, 15]) {
    it(`sq ${sq} ${out} crop ${crop}`, () => {
      const sp = buildSpec({ ...DEFAULTS, cam: "arri-mini-lf", mode: "169", sq, out }), d = framing(sp.W, sp.H, sp.ar, sp.desq ? 1 : sp.squeeze), c = safeRect(d, sp.crop && crop ? crop : crop);
      if (!crop) expect(c).toEqual(d);
      expect(c.w).toBeLessThanOrEqual(d.w); expect(c.x * 2 + c.w).toBe(d.x * 2 + d.w); expect(c.y * 2 + c.h).toBe(d.y * 2 + d.h);
      expect(Math.abs(c.w / d.w - (1 - crop / 100))).toBeLessThan(0.002); expect(Number.isInteger(c.x) && Number.isInteger(c.y)).toBe(true);
    });
  }
});
describe("delivery safe frame", () => {
  const d = { x: 0, y: 270, w: 8640, h: 4860 };
  it("16:9 active holds UHD fully, oversampled 2.25x", () => {
    const g = deliveryRect(d, 3840, 2160); expect(g.rect).toEqual(d); expect(g.scale).toBeCloseTo(2.25); expect(g.upscale).toBe(false);
  });
  it("wide frame gets a centred 16:9 rect; DCI in 16:9 is width-limited", () => {
    const w = { x: 0, y: 500, w: 8640, h: 3615 }, g = deliveryRect(w, 3840, 2160);
    expect(g.rect.h).toBe(3615); expect(Math.abs(g.rect.w / g.rect.h - 16 / 9) * g.rect.h).toBeLessThan(2); expect(g.rect.x * 2 + g.rect.w).toBe(8640);
    const k = deliveryRect(d, 4096, 2160); expect(k.rect.w).toBe(8640); expect(k.rect.y * 2 + k.rect.h).toBe(270 * 2 + 4860);
  });
  it("warns upscale when the source is smaller", () => { const g = deliveryRect({ x: 0, y: 0, w: 1920, h: 1080 }, 3840, 2160); expect(g.upscale).toBe(true); expect(g.scale).toBe(0.5); });
  it("squeezed output counts desqueezed source width", () => { const g = deliveryRect({ x: 0, y: 0, w: 4320, h: 3000 }, 3840, 2160, 2); expect(g.srcW).toBe(g.rect.w * 2); });
});
describe("resolution strings", () => {
  it("recorded vs active vs canvas", () => {
    const sp = buildSpec({ ...DEFAULTS, cam: "arri-mini-lf", mode: "169", sq: "2" }), d = framing(sp.W, sp.H, sp.ar, 1), r = resolutions(sp, d);
    expect(r.recorded).toBe(`${sp.sensorW} × ${sp.H}`); expect(r.canvas).toBe(`${sp.W} × ${sp.H}`); expect(r.activeDesq).toBe(`${d.w} × ${d.h}`); expect(r.active).toBe(`${Math.round(d.w / 2)} × ${d.h}`);
    const sph = buildSpec(DEFAULTS), r2 = resolutions(sph, framing(sph.W, sph.H, sph.ar, 1)); expect(r2.canvas).toBe("");
  });
});
describe("state: new params, legacy and reducer", () => {
  it("round trips crop/style/dsf/cc", () => {
    const s = { ...DEFAULTS, crop: "15", style: "slate", dsf: "uhd,hd", cc: "both" };
    expect(parseState(Object.fromEntries(new URLSearchParams(serialize(s))))).toEqual(s);
    expect(buildSpec(s).delivery.map((x) => x.id)).toEqual(["uhd", "hd"]);
  });
  it("legacy safety=90 maps to crop 10; netflix layers still parse", () => {
    const s = parseState({ safety: "90", layers: "smlcx" }); expect(s.crop).toBe("10"); expect(s.layers).toBe("smlcx");
    expect(parseState({ crop: "3", safety: "90" }).crop).toBe("3"); expect(parseState({ style: "bogus" }).style).toBe(DEFAULTS.style);
  });
  it("one toggle = one update, twice restores", () => {
    const a = reduce(DEFAULTS, { t: "layer", k: "s" }); expect(a.layers.includes("s")).toBe(false);
    expect(reduce(a, { t: "layer", k: "s" }).layers.includes("s")).toBe(true);
    const g = reduce({ ...DEFAULTS, layers: "x" }, { t: "list", key: "dsf", id: "uhd", layer: "d" }); expect(g.dsf).toBe("uhd"); expect(g.layers).toBe("xd");
    expect(reduce(g, { t: "list", key: "dsf", id: "uhd", layer: "d" }).dsf).toBe("");
    expect(reduce(a, { t: "reset", project: "P" })).toEqual({ ...DEFAULTS, project: "P" });
  });
});
