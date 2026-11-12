import type { Viewport } from "next";
import { cookies } from "next/headers";

// Colour at the very top of the page on a phone: the board (sidebar / admin header) or the paper.
// Mirrors --sidebar / --bg in globals.css. The page theme comes from the cookie only (never the OS),
// so one colour per request, not a prefers-color-scheme pair.
const TOP = { board: { light: "#133529", dark: "#0a3225" }, paper: { light: "#fbfaf6", dark: "#111815" } };

export async function themeViewport(top: keyof typeof TOP): Promise<Viewport> {
  const dark = (await cookies()).get("theme")?.value === "dark";
  return { themeColor: TOP[top][dark ? "dark" : "light"] };
}
