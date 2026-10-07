import type { Metadata, Viewport } from "next";
// 字体（免费、自己 host）：大标题 Bricolage Grotesque、正文 Instrument Sans、小标签 DM Mono、中文大标题 Noto Sans SC Black
import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "@fontsource-variable/instrument-sans/wght.css";
import "@fontsource/dm-mono/400.css";
import "@fontsource/dm-mono/500.css";
import "@fontsource/noto-sans-sc/900.css";
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
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0f0f" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
