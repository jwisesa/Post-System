import Link from "next/link";
import { LogoutForm } from "./logout-form";
import { vapidConfigured } from "@/lib/push/vapid";
import { NotifyMenu } from "./notify-menu";
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
      <NotifyMenu vapidKey={vapidConfigured() ? process.env.VAPID_PUBLIC_KEY : undefined} />
      <ThemeToggle />
      <LogoutForm />
    </div>
  );
}
