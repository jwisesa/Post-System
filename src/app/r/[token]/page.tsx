import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { fmtDate } from "@/lib/schedule/dates";
import { getReviewerData } from "@/lib/review/service";
import { ReviewItem } from "./ReviewItem";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function Reviewer({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getReviewerData(await getDb(), token);
  if (!data) notFound();
  return (
    <main className="mx-auto max-w-2xl space-y-5 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="page-title">{data.project.name}</h1>
        <p className="muted text-sm">{data.reviewer.name}{data.reviewer.role && ` · ${data.reviewer.role}`}</p>
      </header>
      {data.items.length === 0 && <p className="muted text-sm">Belum ada milestone yang ditugaskan.</p>}
      {data.items.map((i) => (
        <ReviewItem key={i.id} token={token} id={i.id} name={i.name} date={fmtDate(i.date)} phaseName={i.phaseName} trackName={i.trackName} statusLabel={i.statusLabel} points={i.myPoints} signedAt={i.mySignoff?.createdAt ?? null} />
      ))}
    </main>
  );
}
