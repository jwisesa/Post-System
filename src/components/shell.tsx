import Link from "next/link";
import { logoutAction } from "@/app/admin/actions";
import { ThemeToggle } from "./ui/controls";

export function Brand() {
  return (
    <Link href="/admin" className="flex items-center gap-2 font-semibold tracking-tight">
      <span aria-hidden className="grid size-6 place-items-center rounded-md bg-accent text-xs text-accent-ink">PS</span>
      Post-System
    </Link>
  );
}

export function UserMenu({ name, role }: { name: string; role?: string }) {
  return (
    <div className="flex items-center gap-1 text-sm">
      <span className="hidden px-2 sm:inline">
        {name}
        {role && <span className="muted"> · {role}</span>}
      </span>
      <ThemeToggle />
      <form action={logoutAction}><button className="btn-ghost">Keluar</button></form>
    </div>
  );
}
