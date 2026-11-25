// Money is integer Rupiah. Nothing here uses floating point for prices.

const B0 = BigInt(0), B2 = BigInt(2), B1000 = BigInt(1000), B10000 = BigInt(10000); // target ES2017 has no bigint literals
export const MAX_RP = 1e15;

export class MoneyError extends Error {}

const clean = (s: string) => s.replace(/rp\.?/gi, "").replace(/[\s ]/g, "");

/** "Rp 1.250.000", "1250000", "1.250.000,00". "." is always thousands, "," decimal; non-zero decimals are refused. */
export function parseRupiah(input: string, opts: { allowNegative?: boolean } = {}): number {
  let s = clean(input.replace(/−/g, "-"));
  let neg = false;
  if (s.startsWith("-")) { neg = true; s = s.slice(1); }
  if (neg && !opts.allowNegative) throw new MoneyError("Jumlah tidak boleh negatif.");
  const [whole, frac = "", extra] = s.split(",");
  if (extra !== undefined || !/^\d+(\.\d{3})*$|^\d+$/.test(whole) || !/^\d*$/.test(frac)) throw new MoneyError(`Jumlah "${input.trim()}" tidak valid. Contoh: 1.250.000`);
  if (/[1-9]/.test(frac)) throw new MoneyError("Rupiah tidak memakai desimal. Bulatkan ke rupiah penuh.");
  const n = Number(whole.replace(/\./g, ""));
  if (!Number.isSafeInteger(n) || n > MAX_RP) throw new MoneyError("Jumlah terlalu besar.");
  return neg ? -n : n;
}

/** Grouped number without the "Rp" prefix, sign kept; parseRupiah reads it back. */
export const plainRupiah = (n: number) => formatRupiah(n).replace(/^(−?)Rp /, "$1");

/** Table cells: no "Rp" (the column header says it). */
export const fmt = (n: number) => formatRupiah(n).replace("Rp ", "");

export function formatRupiah(n: number): string {
  return `${n < 0 ? "−" : ""}Rp ${Math.abs(n).toLocaleString("id-ID", { maximumFractionDigits: 0 })}`;
}

/** Quantity in thousandths, Indonesian style: "," is the decimal (max 3), "." only groups thousands ("1.200" = 1200). Any other "." ("2.5") is ambiguous and refused. */
export function parseQty(input: string): number {
  const s = clean(input);
  const m = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,3}))?$/.exec(s);
  if (!m) throw new MoneyError(s.includes(".") ? "Gunakan koma untuk desimal, mis. 2,5" : `Jumlah "${input.trim()}" tidak valid (maksimal 3 desimal).`);
  const n = Number(m[1].replace(/\./g, "")) * 1000 + Number((m[2] ?? "").padEnd(3, "0"));
  if (!Number.isSafeInteger(n) || n <= 0 || n > 1e12) throw new MoneyError("Kuantitas harus lebih dari 0.");
  return n;
}

export function formatQty(milli: number): string {
  const w = Math.trunc(milli / 1000), f = String(Math.abs(milli % 1000)).padStart(3, "0").replace(/0+$/, "");
  return f ? `${w},${f}` : String(w);
}

/** "11" -> 1100, "1,5" -> 150, "" -> null (not applied). 0..100%, up to 2 decimals. */
export function parseRateBp(input: string): number | null {
  const s = clean(input).replace(",", ".").replace(/%$/, "");
  if (s === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new MoneyError(`Tarif "${input.trim()}" tidak valid.`);
  const [w, f = ""] = s.split(".");
  const bp = Number(w) * 100 + Number(f.padEnd(2, "0"));
  if (bp > 10000) throw new MoneyError("Tarif maksimal 100%.");
  return bp;
}

export const formatRateBp = (bp: number | null) => (bp == null ? "" : String(bp / 100).replace(".", ","));

/** Integer division rounding half away from zero. */
export function roundDiv(n: bigint, d: bigint): bigint {
  if (d < B0) { n = -n; d = -d; }
  const neg = n < B0, a = neg ? -n : n;
  const q = (a * B2 + d) / (d * B2);
  return neg ? -q : q;
}

export const lineAmount = (qtyMilli: number, unitPrice: number): number => Number(roundDiv(BigInt(qtyMilli) * BigInt(unitPrice), B1000));

export type Tax = { subtotal: number; ppn: number; pph23: number; gross: number; net: number };

/** PPN on the subtotal; PPh 23 on the subtotal excluding PPN; net = what is actually transferred. An ESTIMATE. */
export function taxOf(subtotal: number, ppnBp: number | null, pph23Bp: number | null): Tax {
  const ppn = ppnBp ? Number(roundDiv(BigInt(subtotal) * BigInt(ppnBp), B10000)) : 0;
  const pph23 = pph23Bp ? Number(roundDiv(BigInt(subtotal) * BigInt(pph23Bp), B10000)) : 0;
  const gross = subtotal + ppn;
  return { subtotal, ppn, pph23, gross, net: gross - pph23 };
}

/** Pre-tax share of an invoice that a payment of `paid` (against its net) covers. */
export function paidPortion(inv: { subtotal: number; ppn: number; pph23: number }, paid: number): number {
  const net = inv.subtotal + inv.ppn - inv.pph23;
  if (net <= 0) return 0;
  const p = Math.max(0, Math.min(paid, net));
  return Number(roundDiv(BigInt(inv.subtotal) * BigInt(p), BigInt(net)));
}
