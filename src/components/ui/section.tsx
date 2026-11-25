"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/** Collapsible page section on <details>; open state is remembered in localStorage (ps.open.<page>.<id>). */
export function Section({ id, title, digest, actions, defaultOpen = true, sticky, children }: {
  id: string; title: React.ReactNode; digest?: React.ReactNode; actions?: React.ReactNode; defaultOpen?: boolean; sticky?: boolean; children: React.ReactNode;
}) {
  const page = usePathname().split("/").pop() || "home";
  const key = `ps.open.${page}.${id}`;
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    try { const v = localStorage.getItem(key); if (v !== null && ref.current) ref.current.open = v === "1"; } catch {}
  }, [key]);
  return (
    <details ref={ref} className="section" open={defaultOpen} onToggle={(e) => { try { localStorage.setItem(key, e.currentTarget.open ? "1" : "0"); } catch {} }}>
      <summary className={`section-h${sticky ? " is-sticky" : ""}`}>
        <h2>{title}</h2>
        {digest && <span className="section-digest">{digest}</span>}
        {actions && <span className="section-actions" onClick={(e) => e.stopPropagation()}>{actions}</span>}
      </summary>
      {children}
    </details>
  );
}
