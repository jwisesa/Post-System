"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

/** Filters apply on change: no "Terapkan" click. */
export function ActivityFilters({ people, kinds }: { people: string[]; kinds: string[] }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const set = (k: string, v: string) => {
    const q = new URLSearchParams(sp);
    if (v) q.set(k, v); else q.delete(k);
    router.replace(q.size ? `${path}?${q}` : path, { scroll: false });
  };
  return (
    <div className="page-actions" style={{ justifyContent: "flex-start" }}>
      <select value={sp.get("who") ?? ""} onChange={(e) => set("who", e.target.value)} aria-label="Filter orang" className="max-w-48">
        <option value="">Semua orang</option>
        {people.map((p) => <option key={p}>{p}</option>)}
      </select>
      <select value={sp.get("kind") ?? ""} onChange={(e) => set("kind", e.target.value)} aria-label="Filter jenis" className="max-w-48">
        <option value="">Semua jenis</option>
        {kinds.map((k) => <option key={k}>{k}</option>)}
      </select>
    </div>
  );
}
