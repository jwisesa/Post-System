import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Sans } from "next/font/google";
import { cookies } from "next/headers";
import { themeViewport } from "@/lib/theme-color";
import { Toaster } from "@/components/ui/toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "Post-System",
  description: "Manajemen pasca produksi: jadwal, teknis, tim, dan deliverables.",
  icons: { icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Post-System", statusBarStyle: "default" },
};

const archivo = Archivo({ subsets: ["latin", "latin-ext"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });
const plex = IBM_Plex_Sans({ subsets: ["latin", "latin-ext"], axes: ["wdth"], variable: "--font-app", display: "swap" });

export async function generateViewport(): Promise<Viewport> {
  // never disable zoom; viewport-fit=cover enables env(safe-area-inset-*); the keyboard resizes the layout viewport
  return { width: "device-width", initialScale: 1, viewportFit: "cover", interactiveWidget: "resizes-content", ...(await themeViewport("paper")) };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("theme")?.value === "dark" ? "dark" : "light";
  return (
    <html lang="id" data-theme={theme} className={`${plex.variable} ${archivo.variable}`}>
      <body>
        <Toaster>{children}</Toaster>
      </body>
    </html>
  );
}
