import type { Metadata } from "next";

export const metadata: Metadata = { title: "Link tidak berlaku", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function ReviewerNotFound() {
  return (
    <main className="mx-auto max-w-2xl space-y-2 p-4 md:p-6">
      <h1 className="page-title">Link tidak berlaku</h1>
      <p className="muted text-sm">Link ini sudah dicabut atau tidak berlaku. Hubungi tim produksi.</p>
    </main>
  );
}
