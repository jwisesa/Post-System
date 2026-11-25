"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Drawer } from "./ui/controls";

/** "Pengaturan project" entry for the switcher popover; the drawer holds the (server-rendered) forms passed as children. */
export function ProjectSettings({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={ref} type="button" className="nav-link w-full text-start" onClick={() => { ref.current?.closest("details")?.removeAttribute("open"); setOpen(true); }}>Pengaturan project</button>
      {open && createPortal(<Drawer title="Pengaturan project" onClose={() => setOpen(false)}>{children}</Drawer>, document.body)}
    </>
  );
}
