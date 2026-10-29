import type { MetadataRoute } from "next";

// Lets you "Add to Home Screen" and open the app full-screen like a native app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pulse",
    short_name: "Pulse",
    description: "Your day, money and plans in one place",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f7f5",
    theme_color: "#0f6b4f",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
