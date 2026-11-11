import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Toaster } from "@/components/ui/toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "Post-System",
  description: "Manajemen pasca produksi: jadwal, teknis, tim, dan deliverables.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("theme")?.value === "dark" ? "dark" : "light";
  return (
    <html lang="id" data-theme={theme}>
      <body>
        <Toaster>{children}</Toaster>
      </body>
    </html>
  );
}
