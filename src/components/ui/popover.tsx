"use client";

import { useEffect, useRef, useState } from "react";

/** Button + .tl-pop menu. Closes on outside press, Escape, or via the render prop. `fixed` escapes overflow clipping (tables). */
export function Popover({ trigger, label, className = "btn-ghost", fixed, children }: { trigger: React.ReactNode; label: string; className?: string; fixed?: boolean; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<React.CSSProperties>();
  const wrap = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const shut = () => setOpen(false);
    const down = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) shut(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { shut(); wrap.current?.querySelector("button")?.focus(); } };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    if (fixed) { window.addEventListener("scroll", shut, true); window.addEventListener("resize", shut); }
    return () => { document.removeEventListener("pointerdown", down); document.removeEventListener("keydown", key); window.removeEventListener("scroll", shut, true); window.removeEventListener("resize", shut); };
  }, [open, fixed]);
  const toggle = () => {
    if (!open && fixed && wrap.current) { const r = wrap.current.getBoundingClientRect(); setPos({ position: "fixed", insetBlockStart: r.bottom + 4, insetInlineEnd: window.innerWidth - r.right }); }
    setOpen(!open);
  };
  return (
    <span ref={wrap} className="relative inline-block">
      <button type="button" className={className} aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={toggle}>{trigger}</button>
      {open && <div className="tl-pop" role="menu" aria-label={label} style={pos}>{children(() => setOpen(false))}</div>}
    </span>
  );
}
