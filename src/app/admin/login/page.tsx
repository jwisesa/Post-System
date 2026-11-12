import { redirect } from "next/navigation";
import { ThemeToggle } from "@/components/ui/controls";
import { ErrorBanner } from "@/components/views";
import { getCurrentUser } from "@/lib/auth/session";
import { loginAction } from "../actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getCurrentUser()) redirect("/admin");
  const { error } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <div className="w-full max-w-sm space-y-5">
        <div>
          <h1 className="page-title">Post-System Admin</h1>
          <p className="muted mt-1 text-sm">Masuk untuk mengelola project pasca produksi.</p>
        </div>
        <ErrorBanner message={error ? "Email atau password salah." : undefined} />
        <form action={loginAction} className="card space-y-3">
          <label><span>Email</span><input name="email" type="email" required autoComplete="username" autoFocus /></label>
          <label><span>Password</span><input name="password" type="password" required autoComplete="current-password" /></label>
          <button className="btn w-full">Masuk</button>
        </form>
        <div className="flex justify-center"><ThemeToggle /></div>
      </div>
    </main>
  );
}
