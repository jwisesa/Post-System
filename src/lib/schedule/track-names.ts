/** Display names that tell same-named tracks apart: "Main Feature", "Main Feature (2)", ... */
export function trackLabels(tracks: { id: string; name: string }[]) {
  const seen = new Map<string, number>();
  return new Map(tracks.map((t) => {
    const n = (seen.get(t.name) ?? 0) + 1;
    seen.set(t.name, n);
    return [t.id, n > 1 ? `${t.name} (${n})` : t.name] as const;
  }));
}
