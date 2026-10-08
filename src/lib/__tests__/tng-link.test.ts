import { describe, expect, it } from "vitest";
import { detectPlatform, tngOpenUrl, TNG_PLAY_STORE } from "../tng-link";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 16; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
const WHATSAPP_ANDROID = `${ANDROID} WhatsApp/2.26.1`;
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

describe("detectPlatform", () => {
  it("iPhone、iPad（假装是 Mac 但有触控）", () => {
    expect(detectPlatform(IPHONE, 5)).toBe("ios");
    expect(detectPlatform(IPAD_DESKTOP, 5)).toBe("ios");
  });
  it("真的 Mac 不是", () => {
    expect(detectPlatform(IPAD_DESKTOP, 0)).toBe("other");
  });
  it("Android、WhatsApp 里面打开的 Android", () => {
    expect(detectPlatform(ANDROID, 5)).toBe("android");
    expect(detectPlatform(WHATSAPP_ANDROID, 5)).toBe("android");
  });
  it("电脑", () => {
    expect(detectPlatform(WINDOWS, 0)).toBe("other");
  });
});

describe("tngOpenUrl", () => {
  it("iPhone 用 TNG 官方的 tngdwallet://", () => {
    expect(tngOpenUrl("ios")).toBe("tngdwallet://");
  });
  it("Android 用 intent，打不开就去 Play Store 的 TNG 页面", () => {
    const url = tngOpenUrl("android")!;
    expect(url.startsWith("intent://#Intent;scheme=tngdwallet;package=my.com.tngdigital.ewallet;")).toBe(true);
    expect(url).toContain(`S.browser_fallback_url=${encodeURIComponent(TNG_PLAY_STORE)}`);
    expect(url.endsWith(";end")).toBe(true);
  });
  it("电脑没有 TNG app", () => {
    expect(tngOpenUrl("other")).toBeNull();
  });
});
