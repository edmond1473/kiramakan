"use client";

import { useSyncExternalStore } from "react";
import { detectPlatform, tngOpenUrl, type Platform } from "../tng-link";

const noopSubscribe = () => () => {};

/** 这部机是 iPhone / Android / 电脑（server render 和 hydration 时当作电脑） */
export function usePlatform(): Platform {
  return useSyncExternalStore(
    noopSubscribe,
    () => detectPlatform(navigator.userAgent, navigator.maxTouchPoints),
    () => "other",
  );
}

/**
 * 马上开始复制（不等结果）：一定要在按钮的 onClick 里同步叫，
 * 跳去 TNG 之前 iPhone 才会让我们写剪贴板。
 */
export function copyNow(text: string): void {
  const legacy = () => {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    } catch {
      // 复制不了也没关系，付款画面有金额
    }
  };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(legacy);
  else legacy();
}

/** 复制金额、打开 TNG。返回 false = 这部机没有 TNG app 可以打开（例如电脑） */
export function copyAndOpenTng(amountText: string, platform: Platform): boolean {
  copyNow(amountText);
  const url = tngOpenUrl(platform);
  if (!url) return false;
  window.location.href = url;
  return true;
}
