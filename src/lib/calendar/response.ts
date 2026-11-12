import { buildIcs } from "./ics";
import type { Feed } from "./service";

/** Shared by both feed routes. */
export function icsResponse(feed: Feed | null): Response {
  if (!feed) return new Response("Not found", { status: 404 });
  return new Response(buildIcs(`${feed.projectName} · Post-System`, feed.events), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300" },
  });
}
