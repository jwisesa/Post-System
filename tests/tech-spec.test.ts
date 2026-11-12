import { describe, expect, it } from "vitest";
import { parseTechSpec } from "@/lib/tech-spec/schema";

describe("parseTechSpec", () => {
  it("accepts new and camera-2 keys, drops unknown", () => {
    const out = parseTechSpec({ dit_checksum: " xxHash64 ", cam2_model: "Sony FX6", cam_primary: "2", bogus: "x" });
    expect(out).toEqual({ dit_checksum: "xxHash64", cam2_model: "Sony FX6", cam_primary: "2" });
  });
});
