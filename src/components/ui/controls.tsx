"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useToast } from "./toast";

export function ThemeToggle() {
  return (
    <button
      type="button"
      className="btn-ghost"
      aria-label="Ganti tema terang/gelap"
      title="Ganti tema"
      onClick={() => {
        const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
      }}
    >
      <span aria-hidden>◐</span> Tema
    </button>
  );
}

export function NavLink({ href, exact, children }: { href: string; exact?: boolean; children: React.ReactNode }) {
  const path = usePathname();
  const active = exact ? path === href : path === href || path.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`block rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap transition ${active ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-raised hover:text-ink"}`}
    >
      {children}
    </Link>
  );
}

export function CopyButton({ text, label = "Salin", className = "btn-secondary" }: { text: string; label?: string; className?: string }) {
  const toast = useToast();
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast({ message: "Disalin ke clipboard." });
        } catch {
          toast({ message: "Tidak bisa menyalin otomatis; salin manual.", tone: "error" });
        }
      }}
    >
      {label}
    </button>
  );
}

/** Submit button that asks first. Works inside any <form action={...}>. */
export function ConfirmButton({ message, className = "btn-danger", children, ...rest }: { message: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} className={className} onClick={(e) => { if (!window.confirm(message)) e.preventDefault(); }}>
      {children}
    </button>
  );
}

/** Text input with a filterable list of prepared options; any typed value is still accepted. */
export function Combobox({ name, options, defaultValue = "", placeholder, onValue, changed }: {
  name: string; options: string[]; defaultValue?: string; placeholder?: string; onValue?: (v: string) => void; changed?: boolean;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  const q = value.trim().toLowerCase();
  const shown = options.includes(value) ? options : options.filter((o) => o.toLowerCase().includes(q));
  const set = (v: string) => { setValue(v); onValue?.(v); };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={box} className="relative">
      <input
        name={name}
        value={value}
        placeholder={placeholder ?? (options.length ? "Pilih atau ketik…" : undefined)}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        className={changed ? "!border-warn" : undefined}
        onChange={(e) => { set(e.target.value); setOpen(true); setActive(-1); }}
        onFocus={() => options.length && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, shown.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && open && active >= 0) { e.preventDefault(); set(shown[active]); setOpen(false); }
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && shown.length > 0 && (
        <ul id={listId} role="listbox" className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-md border border-line bg-surface py-1 shadow-lg">
          {shown.map((o, i) => (
            <li
              key={o}
              role="option"
              aria-selected={o === value}
              className={`cursor-pointer px-2.5 py-1.5 text-sm ${i === active ? "bg-accent-soft text-accent" : o === value ? "font-medium" : ""} hover:bg-raised`}
              onMouseDown={(e) => { e.preventDefault(); set(o); setOpen(false); }}
            >
              {o}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Right-hand side panel. Closes on Esc or the ✕ button. */
export function Drawer({ title, onClose, children }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <aside role="dialog" aria-label={typeof title === "string" ? title : "Detail"} className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-line bg-surface shadow-2xl">
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="min-w-0 break-words">{title}</h2>
        <button type="button" className="btn-ghost" aria-label="Tutup panel" onClick={onClose}>✕</button>
      </header>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">{children}</div>
    </aside>
  );
}

export function Tabs({ tabs }: { tabs: { id: string; label: string; content: React.ReactNode }[] }) {
  const [current, setCurrent] = useState(tabs[0].id);
  return (
    <>
      <div role="tablist" className="flex gap-1 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={t.id === current}
            className={`-mb-px cursor-pointer border-b-2 px-3 py-2 text-sm ${t.id === current ? "border-accent font-medium text-accent" : "border-transparent text-muted hover:text-ink"}`}
            onClick={() => setCurrent(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" hidden={t.id !== current} className="space-y-4 pt-4">{t.content}</div>
      ))}
    </>
  );
}
