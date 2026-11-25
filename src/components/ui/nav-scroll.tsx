"use client";

import { useEffect, useRef } from "react";

/** Mobile nav row: keep the active link in view on mount. */
export function NavScroll({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { ref.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: "center", block: "nearest" }); }, []);
  return <nav ref={ref} aria-label="Navigasi project" className="nav-scroll flex gap-0.5 overflow-x-auto px-2 pb-3 md:flex-col md:overflow-visible">{children}</nav>;
}
