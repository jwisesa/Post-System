import { notFound, redirect } from "next/navigation";
import { ErrorBanner } from "@/components/views";
import { getDb } from "@/db/client";
import { createFirstAdmin, hasAnyUser, InputError } from "@/lib/services";

// One-time bootstrap for a fresh deployment. 404 unless SETUP_KEY is set and no account exists yet.
async function setupAction(f: FormData) {
  "use server";
  const text = (k: string) => String(f.get(k) ?? "");
  try {
    await createFirstAdmin(await getDb(), process.env.SETUP_KEY, { key: text("key"), name: text("name"), email: text("email"), password: text("password") });
  } catch (e) {
    if (!(e instanceof InputError)) throw e;
    redirect(`/setup?error=${encodeURIComponent(e.message)}`);
  }
  redirect("/admin/login");
}

export default async function Setup({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!process.env.SETUP_KEY || (await hasAnyUser(await getDb()))) notFound();
  const { error } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <div className="w-full max-w-sm space-y-5">
        <div>
          <h1 className="page-title">Setup awal</h1>
          <p className="muted mt-1 text-sm">Buat akun supervisor pertama. Halaman ini tertutup setelah akun dibuat.</p>
        </div>
        <ErrorBanner message={error} />
        <form action={setupAction} className="card space-y-3">
          <label><span>Setup key (nilai SETUP_KEY di Vercel)</span><input name="key" type="password" required autoComplete="off" autoCapitalize="none" autoCorrect="off" enterKeyHint="next" /></label>
          <label><span>Nama</span><input name="name" required autoComplete="name" /></label>
          <label><span>Email</span><input name="email" type="email" inputMode="email" required autoComplete="username" autoCapitalize="none" autoCorrect="off" enterKeyHint="next" /></label>
          <label><span>Password (minimal 8 karakter)</span><input name="password" type="password" required minLength={8} autoComplete="new-password" autoCapitalize="none" autoCorrect="off" enterKeyHint="go" /></label>
          <button className="btn w-full">Buat akun</button>
        </form>
      </div>
    </main>
  );
}
