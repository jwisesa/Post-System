import { getDocumentProxy } from "unpdf";
import { InputError } from "../services";
import { REVISION_MARK, type PdfLine, type PdfPage } from "./types";

export const MAX_BYTES = 4 * 1024 * 1024;
export const MAX_PAGES = 400;

const NOT_CONTENT = /^(?:\d{1,3}[.)]?|\(?(?:CONTINUED|CONT'?D|LANJUT|BERSAMBUNG|MORE)\)?:?(?:\s*\(?\d{1,3}\)?)?|\d{1,3}\s+CONTINUED:?)$/i;

type Item = { str: string; x: number; y: number; w: number; h: number };

const SLUG = /^(?:INT|EXT|EKS|DLM|DALAM|LUAR|I\/E)\b/;
const MARGIN_TOKEN = /^[\d*]+[A-Z]?\.?$/;

/**
 * Drops items whose text repeats at about the same position on >= 30% of the pages (running headers, footers, watermarks).
 * Sluglines tokens (INT./EXT. ...) are never dropped. ponytail: exact text + 4pt position bucket; a header whose text changes per page (e.g. a page number inside it) survives.
 */
export function dropRepeating(pages: Item[][]): Item[][] {
  if (pages.length < 4) return pages;
  const norm = (i: Item) => i.str.trim().replace(/\s+/g, " ").toUpperCase();
  const repeatable = (i: Item) => norm(i).length >= 4 && !/^[\d\s.,\-]+$/.test(norm(i)) && !SLUG.test(norm(i));
  const key = (i: Item) => `${norm(i)}@${Math.round(i.x / 4)},${Math.round(i.y / 4)}`;
  const seen = new Map<string, Set<number>>();
  pages.forEach((items, n) => {
    for (const i of items) if (repeatable(i)) seen.set(key(i), (seen.get(key(i)) ?? new Set()).add(n));
  });
  const min = Math.max(3, pages.length * 0.3);
  return pages.map((items) => items.filter((i) => !repeatable(i) || (seen.get(key(i))?.size ?? 0) < min));
}

/**
 * Merges text items sharing a baseline (small jitter tolerated) into lines, top to bottom. A gap wider than 0.25 em becomes a space
 * (right-margin scene numbers stay separate words), standalone revision marks are removed, and x is the first item that is not a margin number.
 */
export function groupLines(items: Item[]): PdfLine[] {
  const live = items.filter((i) => i.str.trim() && i.str.trim() !== "*");
  live.sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: Item[][] = [];
  for (const it of live) {
    const row = rows.find((r) => Math.abs(r[0].y - it.y) <= Math.max(2, (r[0].h || 10) * 0.3));
    if (row) row.push(it);
    else rows.push([it]);
  }
  return rows
    .map((r) => {
      r.sort((a, b) => a.x - b.x);
      let text = r[0].str;
      for (let i = 1; i < r.length; i++) {
        const gap = r[i].x - (r[i - 1].x + r[i - 1].w);
        const glued = /\s$/.test(text) || /^\s/.test(r[i].str);
        text += (glued || Math.abs(gap) < (r[i].h || 10) * 0.25 ? "" : " ") + r[i].str;
      }
      let k = 0;
      while (k < r.length - 1 && MARGIN_TOKEN.test(r[k].str.trim()) && r[k + 1].x - (r[k].x + r[k].w) > 2 * (r[k].h || 10)) k++;
      return { y: r[0].y, x: r[k].x, text: text.replace(REVISION_MARK, " ").replace(/[ \s]+/g, " ").trim() };
    })
    .filter((l) => l.text)
    .sort((a, b) => b.y - a.y);
}

/** Flags page numbers and "CONTINUED"/"(MORE)" lines near the top or bottom edge of a page. */
function flagHeaderFooter(lines: PdfLine[], height: number): PdfLine[] {
  const ys = lines.map((l) => l.y);
  const top = Math.max(...ys), bottom = Math.min(...ys);
  return lines.map((l) => ((l.y >= top - height * 0.03 || l.y <= bottom + height * 0.03 || l.y > height * 0.9 || l.y < height * 0.08) && NOT_CONTENT.test(l.text) ? { ...l, skip: true } : l));
}

/** Extracts positioned text lines from a PDF. Pages are 1-based. Throws InputError for oversize or unreadable files. */
export async function extractPages(buf: Uint8Array): Promise<PdfPage[]> {
  if (buf.byteLength > MAX_BYTES) throw new InputError("File terlalu besar (maksimal 4 MB).");
  let pdf;
  try {
    pdf = await getDocumentProxy(new Uint8Array(buf));
  } catch {
    throw new InputError("Naskah tidak dikenali: file bukan PDF yang valid atau terkunci.");
  }
  if (pdf.numPages > MAX_PAGES) throw new InputError(`Naskah terlalu panjang (maksimal ${MAX_PAGES} halaman).`);
  const heights: number[] = [];
  const raw: Item[][] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    heights.push(page.getViewport({ scale: 1 }).height);
    const tc = await page.getTextContent();
    raw.push(tc.items.flatMap((i) => ("str" in i ? [{ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: i.height }] : [])));
  }
  return dropRepeating(raw).map((items, n) => {
    const lines = groupLines(items);
    return { page: n + 1, height: heights[n], lines: lines.length ? flagHeaderFooter(lines, heights[n]) : [] };
  });
}
