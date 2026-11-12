import { expect, it } from "vitest";
import { toCsv } from "@/lib/schedule/csv";

it("quotes commas, quotes and newlines; uses CRLF", () => {
  expect(toCsv([["a", "b,c", 'd"e', "f\ng"], ["", "x", "y", "z"]])).toBe('a,"b,c","d""e","f\ng"\r\n,x,y,z\r\n');
});
