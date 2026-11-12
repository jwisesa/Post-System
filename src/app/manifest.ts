import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Post-System",
    short_name: "Post-System",
    description: "Manajemen pasca produksi: jadwal, teknis, tim, dan deliverables.",
    start_url: "/admin",
    display: "standalone",
    background_color: "#f6f6f3",
    theme_color: "#2b55cc",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
