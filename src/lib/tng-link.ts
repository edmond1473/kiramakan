// 从网页打开 TNG eWallet app。
// TNG 官方的 deeplink 是 tngdwallet://（TNG mini program 开发文件）。只能「打开 app」：
// 不能帮朋友选好收款人、也不能填好金额（个人转账没有开放），所以金额先复制好，朋友进去贴上。

export const TNG_ANDROID_PACKAGE = "my.com.tngdigital.ewallet";
export const TNG_PLAY_STORE = `https://play.google.com/store/apps/details?id=${TNG_ANDROID_PACKAGE}`;

export type Platform = "ios" | "android" | "other";

/** iPad 的 Safari 会假装是 Mac，要看有没有触控 */
export function detectPlatform(userAgent: string, maxTouchPoints = 0): Platform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "other";
}

/** 打开 TNG 的链接；电脑没有 TNG app → null */
export function tngOpenUrl(platform: Platform): string | null {
  if (platform === "ios") return "tngdwallet://";
  if (platform === "android") {
    // Chrome 的 intent 链接：有装 TNG 就打开；对不上的话去 Play Store 的 TNG 页面（那里按「开启」也会打开）
    return `intent://#Intent;scheme=tngdwallet;package=${TNG_ANDROID_PACKAGE};S.browser_fallback_url=${encodeURIComponent(TNG_PLAY_STORE)};end`;
  }
  return null;
}
