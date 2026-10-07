import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KiraMakan",
    short_name: "KiraMakan",
    description: "拍 receipt、分 item、自动摊 tax，记录谁还没还钱。",
    start_url: "/",
    display: "standalone",
    background_color: "#fff100",
    theme_color: "#fff100",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
