import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 开发时左下角的 Next.js 小圆标会挡住底部 bar，关掉
  devIndicators: false,
  async headers() {
    return [
      {
        // service worker 每次都要拿最新的（不然改了通知的行为，手机会一直用旧的）
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
