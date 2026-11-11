import { redirect } from "next/navigation";
import { ErrorBanner } from "@/components/views";
import { getCurrentUser } from "@/lib/auth/session";
import { loginAction } from "../actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getCurrentUser()) redirect("/admin");
  const { error } = await searchParams;
  return (
    <main className="mx-auto mt-24 max-w-sm space-y-4 p-4">
      <h1>Post-System Admin</h1>
      <ErrorBanner message={error ? "Email atau password salah." : undefined} />
      <form action={loginAction} className="card space-y-3">
        <label><span>Email</span><input name="email" type="email" required autoComplete="username" /></label>
        <label><span>Password</span><input name="password" type="password" required autoComplete="current-password" /></label>
        <button className="btn">Masuk</button>
      </form>
    </main>
  );
}
