import Link from "next/link";
import { logoutAction } from "@/app/admin/actions";
import { ThemeToggle } from "./ui/controls";

export function Brand() {
  return (
    <Link href="/admin" className="brand" aria-label="Post-System">
      <span className="brand-full">Post-System</span>
      <span className="brand-mono" aria-hidden>PS</span>
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
