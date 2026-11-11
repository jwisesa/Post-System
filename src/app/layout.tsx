import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Post-System",
  description: "Manajemen pasca produksi: jadwal, teknis, tim, dan deliverables.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
