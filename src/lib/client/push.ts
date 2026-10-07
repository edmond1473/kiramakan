"use client";

import { api } from "./api";

// 浏览器这一边的手机通知：注册 service worker、订阅、告诉 server。

export interface PushEnv {
  /** 这个浏览器可以开通知 */
  supported: boolean;
  ios: boolean;
  /** 从主画面打开的（iPhone 一定要这样才能开通知） */
  standalone: boolean;
}

export function pushEnv(): PushEnv {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  return { supported, ios, standalone };
}

export async function registerWorker(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  return navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await registerWorker();
  return reg.pushManager.getSubscription();
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = window.atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function sameKey(sub: PushSubscription, publicKey: string): boolean {
  const key = sub.options?.applicationServerKey;
  if (!key) return true; // 读不到就当作一样
  const a = new Uint8Array(key);
  const b = urlBase64ToUint8Array(publicKey);
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

export interface PushReady {
  reg: ServiceWorkerRegistration;
  publicKey: string;
  /** 这部手机已经订阅了（而且是用现在的金钥） */
  subscribed: boolean;
}

/** 打开设定页时先准备好：service worker、金钥；旧金钥的订阅先取消 */
export async function preparePush(): Promise<PushReady> {
  const [, r] = await Promise.all([registerWorker(), api<{ publicKey: string }>("/api/push/key")]);
  // 要等 service worker 启动好（active）才可以订阅
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub, r.publicKey)) {
    await sub.unsubscribe().catch(() => false);
    sub = null;
  }
  return { reg, publicKey: r.publicKey, subscribed: !!sub && Notification.permission === "granted" };
}

/**
 * 开通知。一定要在按钮的 onClick 里第一个叫（iPhone 规定要是用户亲手按的），
 * subscribe 会自己跳出「允许通知」。
 */
export async function enablePush(ready: PushReady): Promise<PushSubscription> {
  let sub: PushSubscription;
  try {
    sub = await ready.reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(ready.publicKey),
    });
  } catch (e) {
    const permission = "Notification" in window ? Notification.permission : "default";
    if (permission === "denied") {
      throw new Error("通知被拒绝了。到 iPhone「设定 → 通知 → KiraMakan」打开「允许通知」，再回来按一次。");
    }
    if (permission !== "granted") throw new Error("没有允许通知，请再按一次，跳出来时按「允许」。");
    throw new Error(`开不到通知：${e instanceof Error ? e.message : String(e)}`);
  }
  await api("/api/push/subscribe", { body: sub.toJSON() });
  return sub;
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  try {
    await api("/api/push/subscribe", { method: "DELETE", body: { endpoint: sub.endpoint } });
  } finally {
    await sub.unsubscribe();
  }
}

const SYNC_KEY = "km-push-sync";

/** 每天一次：把这部手机的订阅再告诉 server（server 删掉了、或浏览器换了订阅都会补回来） */
export async function syncPush(): Promise<void> {
  if (!pushEnv().supported || Notification.permission !== "granted") return;
  try {
    const last = Number(localStorage.getItem(SYNC_KEY) ?? 0);
    if (Date.now() - last < 20 * 3600_000) return;
  } catch {
    // 读不到 localStorage 就照样同步
  }
  const sub = await currentSubscription();
  if (!sub) return;
  await api("/api/push/subscribe", { body: sub.toJSON() });
  try {
    localStorage.setItem(SYNC_KEY, String(Date.now()));
  } catch {
    // 没关系
  }
}
