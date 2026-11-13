import { describe, expect, it } from "vitest";
import { parseTechSpec } from "@/lib/tech-spec/schema";

describe("parseTechSpec", () => {
  it("accepts new and camera-2 keys, drops unknown", () => {
    const out = parseTechSpec({ dit_checksum: " xxHash64 ", cam2_model: "Sony FX6", cam_primary: "2", bogus: "x" });
    expect(out).toEqual({ dit_checksum: "xxHash64", cam2_model: "Sony FX6", cam_primary: "2" });
  });

  it("accepts film camera keys for cameras 1 and 2, still drops unknown", () => {
    const input = { cam1_media: "Film 35mm", cam1_stock: "Kodak Vision3 500T 5219/7219", cam1_scancs: "Cineon log", cam2_media: "Film Super 16", cam2_keycode: "ALE + keycode", cam2_negative: "Lab", cam1_bogus: "x" };
    const { cam1_bogus, ...expected } = input;
    expect(parseTechSpec(input)).toEqual(expected);
    expect(cam1_bogus).toBe("x");
  });
});
