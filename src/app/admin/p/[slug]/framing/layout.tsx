import { fontVars } from "@/components/framing/fonts"; // loads chart fonts on this route only

export default function FramingLayout({ children }: { children: React.ReactNode }) { return <div className={fontVars}>{children}</div>; }
