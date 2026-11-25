"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/components/ui/icons";

export type ExportItem = { href: string; label: string; kind: "csv" | "pdf" };

/** One export menu per recap: CSV items download, PDF items open the print page. */
export function ExportMenu({ items, label = "Export" }: { items: ExportItem[]; label?: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const shut = () => ref.current?.removeAttribute("open");
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && ref.current?.open) { shut(); ref.current.querySelector("summary")?.focus(); } };
    const down = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) shut(); };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", down);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("pointerdown", down); };
  }, []);
  return (
    <details ref={ref} className="tl-details relative">
      <summary className="btn-secondary cursor-pointer" aria-label={label}><Icon name="download" /> {label}</summary>
      <div className="tl-pop" role="menu" aria-label={label}>
        {items.map((l) => (
          <a key={l.href} role="menuitem" href={l.href} download={l.kind === "csv" || undefined} onClick={(e) => e.currentTarget.closest("details")?.removeAttribute("open")}><Icon name={l.kind === "csv" ? "download" : "print"} /> {l.label}</a>
        ))}
      </div>
    </details>
  );
}
