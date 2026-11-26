import { expect, it } from "vitest";
import { pgSafe } from "@/lib/services";

it("pgSafe keeps emoji ZWJ/ZWNJ sequences, strips NUL, zero-width space, bidi marks and lone surrogates", () => {
  const family = "👨‍👩‍👧";
  expect(pgSafe(family)).toBe(family);
  expect(pgSafe("می‌خواهم")).toBe("می‌خواهم");
  expect(pgSafe("a\u0000b​c‎d‪e⁦f﻿g­h\ud800")).toBe("abcdefgh�");
});
