"use client";

import { usePathname } from "next/navigation";
import { PageSkeleton } from "@/components/PageSkeleton";

/** 首页是黄色区块；朋友、设定是底部 tab 的页，没有返回按钮；其他页左上角有返回按钮 */
export default function Loading() {
  const pathname = usePathname();
  if (pathname === "/") return <PageSkeleton hero />;
  return <PageSkeleton back={pathname !== "/people" && pathname !== "/settings"} />;
}
