// Stroke icons drawn on a 16px grid; they inherit the text colour.
const paths = {
  chevron: "M6 4l4 4-4 4",
  left: "M10 4L6 8l4 4",
  plus: "M8 3v10M3 8h10",
  close: "M4 4l8 8M12 4l-8 8",
  undo: "M6 4L3 7l3 3M3 7h6.5a3.5 3.5 0 010 7H7",
  redo: "M10 4l3 3-3 3M13 7H6.5a3.5 3.5 0 000 7H9",
  link: "M6.5 9.5l3-3M7 5l1-1a2.5 2.5 0 013.5 3.5l-1 1M9 11l-1 1a2.5 2.5 0 01-3.5-3.5l1-1",
  download: "M8 3v7M5 7.5L8 10.5l3-3M3 13h10",
  check: "M3 8.5l3.2 3.2L13 4.8",
  external: "M5 11l6-6M6 4.5h5.5V10",
  sun: "M8 5a3 3 0 100 6 3 3 0 000-6zM8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1",
  moon: "M13 9.5A5.5 5.5 0 116.5 3a4.5 4.5 0 006.5 6.5z",
  print: "M4.5 6V3h7v3M4.5 11H3V6.5h10V11h-1.5M4.5 9h7v4h-7z",
  panel: "M2.5 3.5h11v9h-11zM6.5 3.5v9",
  today: "M3 4.5h10v8.5H3zM3 7.5h10M5.5 3v3M10.5 3v3",
  timeline: "M2.5 4.5h6M5.5 8h8M3.5 11.5h7",
  deliverables: "M8 2.5l5.5 3-5.5 3-5.5-3zM2.5 8.5L8 11.5l5.5-3M2.5 11L8 14l5.5-3",
  assets: "M2.5 4.5h4l1.5 1.5h5.5v6.5h-11z",
  technical: "M5.5 4.5L2.5 8l3 3.5M10.5 4.5l3 3.5-3 3.5M9 3.5l-2 9",
  team: "M6 7.5a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5zM2 13c0-2.2 1.8-3.5 4-3.5s4 1.3 4 3.5M11 7a1.75 1.75 0 100-3.5M11.5 9.5c1.5.2 2.5 1.3 2.5 3",
  access: "M5.5 7V5a2.5 2.5 0 015 0v2M3.5 7h9v6.5h-9z",
  report: "M4 2.5h6l2.5 2.5v8.5H4zM6 8h4.5M6 10.5h4.5",
  activity: "M2 8h3l2-4.5 2.5 9L11 8h3",
  minus: "M3 8h10",
  feedback: "M3 3.5h10v7H8.5L5.5 13v-2.5H3zM5.5 6h5M5.5 8h3",
  edl: "M2.5 3.5h11v9h-11zM2.5 6.5h11M2.5 9.5h11M6 3.5v9",
} as const;

export type IconName = keyof typeof paths;
export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
      <path d={paths[name]} />
    </svg>
  );
}
