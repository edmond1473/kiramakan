import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "KiraMakan", template: "%s · KiraMakan" },
  description: "拍 receipt、分 item、自动摊 tax，记录谁还没还钱。",
  applicationName: "KiraMakan",
  appleWebApp: { capable: true, title: "KiraMakan", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
