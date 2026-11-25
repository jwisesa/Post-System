"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";

const PAGES: Record<string, string> = {
  timeline: "Timeline", deliverables: "Deliverables", budget: "Anggaran & vendor", assets: "Aset & dokumen", technical: "Technical Page",
  checks: "Pemeriksaan", edl: "Tool EDL", script: "Naskah", team: "Tim", access: "Akses", report: "Laporan", activity: "Change log",
};
const SUB: Record<string, string> = { scope: "Scope", compare: "Bandingkan", print: "Cetak", markers: "Penanda", export: "Export", upload: "Unggah" };

/** Crumb bar derived from the URL: no per-page wiring, works with server components. */
export function Topbar({ slug, projectName, children }: { slug: string; projectName: string; children: React.ReactNode }) {
  const base = `/admin/p/${slug}`;
  const path = usePathname();
  const [page, sub] = path.slice(base.length).split("/").filter(Boolean);
  const pageLabel = page ? PAGES[page] ?? page : undefined;
  const subLabel = sub ? SUB[sub] ?? sub : undefined;
  const parent = pageLabel && subLabel ? { href: `${base}/${page}`, label: pageLabel } : undefined;
  const sep = <span className="crumb-sep" aria-hidden>/</span>;
  return (
    <header className="topbar print:hidden" data-top={parent ? undefined : ""}>
      <nav aria-label="Posisi" className="crumbs">
        {parent && <Link href={parent.href} className="crumb-back" aria-label={`Kembali ke ${parent.label}`}><Icon name="chevron" /> <span className="ps-1">{parent.label}</span></Link>}
        {pageLabel ? <Link href={base} className="crumb-root truncate">{projectName}</Link> : <span aria-current="page" className="truncate">{projectName}</span>}
        {pageLabel && sep}
        {pageLabel && (subLabel ? <Link href={`${base}/${page}`} className="crumb-mid">{pageLabel}</Link> : <span aria-current="page">{pageLabel}</span>)}
        {subLabel && sep}
        {subLabel && <span aria-current="page">{subLabel}</span>}
      </nav>
      <div className="topbar-user ms-auto shrink-0">{children}</div>
    </header>
  );
}
