"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

type Toast = { id: number; message: string; tone: "ok" | "error"; action?: { label: string; run: () => void } };
type Push = (t: Omit<Toast, "id" | "tone"> & { tone?: Toast["tone"] }) => void;

const Ctx = createContext<Push>(() => {});
export const useToast = () => useContext(Ctx);

export function Toaster({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const push = useCallback<Push>(
    (t) => {
      const id = next.current++;
      setToasts((ts) => [...ts.slice(-2), { tone: "ok", ...t, id }]);
      setTimeout(() => dismiss(id), t.action ? 9000 : 4500);
    },
    [dismiss],
  );
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div key={t.id} role="status" className={`pointer-events-auto flex max-w-lg items-center gap-3 rounded-lg border px-3 py-2 text-sm shadow-lg ${t.tone === "error" ? "border-danger bg-danger-soft text-danger" : "border-line bg-ink text-bg"}`}>
            <span>{t.message}</span>
            {t.action && (
              <button className="cursor-pointer font-semibold underline" onClick={() => { t.action!.run(); dismiss(t.id); }}>
                {t.action.label}
              </button>
            )}
            <button aria-label="Tutup" className="cursor-pointer opacity-70 hover:opacity-100" onClick={() => dismiss(t.id)}>✕</button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
