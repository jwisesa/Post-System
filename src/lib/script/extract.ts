import { getDocumentProxy } from "unpdf";
import { InputError } from "../services";
import type { PdfLine, PdfPage } from "./types";

export const MAX_BYTES = 4 * 1024 * 1024;
export const MAX_PAGES = 400;

const NOT_CONTENT = /^(?:\d{1,3}[.)]?|\(?(?:CONTINUED|CONT'?D|LANJUT|BERSAMBUNG|MORE)\)?:?(?:\s*\(?\d{1,3}\)?)?|\d{1,3}\s+CONTINUED:?)$/i;

type Item = { str: string; x: number; y: number; w: number; h: number };

/** Merges text items sharing a baseline (small jitter tolerated) into lines, top to bottom, keeping the leftmost x. */
export function groupLines(items: Item[]): PdfLine[] {
  const live = items.filter((i) => i.str.trim());
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
        text += (glued || gap < (r[i].h || 10) * 0.15 ? "" : " ") + r[i].str;
      }
      return { y: r[0].y, x: r[0].x, text: text.replace(/[ \s]+/g, " ").trim() };
    })
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
  const pages: PdfPage[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const height = page.getViewport({ scale: 1 }).height;
    const tc = await page.getTextContent();
    const items = tc.items.flatMap((i) => ("str" in i ? [{ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: i.height }] : []));
    const lines = groupLines(items);
    pages.push({ page: n, height, lines: lines.length ? flagHeaderFooter(lines, height) : [] });
  }
  return pages;
}
