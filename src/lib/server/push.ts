import "server-only";
import { WebPushError, generateVAPIDKeys, sendNotification } from "web-push";
import { db } from "./db";
import { HttpError } from "./auth";

// 手机通知（Web Push）。iPhone 要先把网站「加到主画面」，从主画面打开才可以开通知（iOS 16.4 以上）。

export interface PushPayload {
  title: string;
  body: string;
  /** 按通知后打开的页面 */
  url: string;
  /** 同一个 tag 的通知会盖掉旧的（例如每天的提醒） */
  tag?: string;
}

export interface PushResult {
  devices: number;
  sent: number;
  failed: number;
}

let cachedKeys: { publicKey: string; privateKey: string } | null = null;

/** VAPID 金钥：有设环境变数就用，没有的话第一次自动产生、存进资料库 */
export async function vapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const pub = process.env.VAPID_PUBLIC_KEY?.trim();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (pub && priv) return { publicKey: pub, privateKey: priv };
  if (cachedKeys) return cachedKeys;
  const sql = await db();
  const fresh = generateVAPIDKeys();
  await sql`insert into app_settings (key, value) values ('vapid_keys', ${JSON.stringify(fresh)}) on conflict (key) do nothing`;
  const [row] = await sql<{ value: string }[]>`select value from app_settings where key = 'vapid_keys'`;
  const parsed = JSON.parse(row.value) as { publicKey: string; privateKey: string };
  cachedKeys = { publicKey: parsed.publicKey, privateKey: parsed.privateKey };
  return cachedKeys;
}

/** Apple 要求 VAPID subject 是 https 网址或 mailto */
function vapidSubject(): string {
  if (process.env.VAPID_SUBJECT) return process.env.VAPID_SUBJECT;
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (host) return `https://${host.replace(/^https?:\/\//, "")}`;
  return "mailto:kiramakan@users.noreply.github.com";
}

/** 只接受各家浏览器的推送服务（Apple / Google / Mozilla / Microsoft），不会帮人打去别的网址 */
const PUSH_HOSTS = [/(^|\.)push\.apple\.com$/, /(^|\.)googleapis\.com$/, /(^|\.)mozilla\.com$/, /(^|\.)mozaws\.net$/, /(^|\.)notify\.windows\.com$/];

export function isPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

export interface SubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function saveSubscription(userId: string, sub: SubscriptionInput, userAgent: string | null) {
  if (!isPushEndpoint(sub.endpoint)) throw new HttpError(400, "这个浏览器的通知服务不支持");
  const sql = await db();
  await sql`
    insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
    values (${userId}, ${sub.endpoint}, ${sub.keys.p256dh}, ${sub.keys.auth}, ${userAgent?.slice(0, 300) ?? null})
    on conflict (endpoint) do update set
      user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
      user_agent = excluded.user_agent, fail_count = 0`;
}

export async function removeSubscription(userId: string, endpoint: string) {
  const sql = await db();
  await sql`delete from push_subscriptions where user_id = ${userId} and endpoint = ${endpoint}`;
}

export async function deviceCount(userId: string): Promise<number> {
  const sql = await db();
  const [r] = await sql`select count(*)::int as n from push_subscriptions where user_id = ${userId}`;
  return r.n;
}

/** 发通知到这个人所有开了通知的手机 / 电脑 */
export async function sendPush(userId: string, payload: PushPayload): Promise<PushResult> {
  const sql = await db();
  const subs = await sql<{ id: string; endpoint: string; p256dh: string; auth: string }[]>`
    select id, endpoint, p256dh, auth from push_subscriptions where user_id = ${userId}`;
  if (subs.length === 0) return { devices: 0, sent: 0, failed: 0 };

  // 本机测试：不真的发，印在 log
  if (process.env.PUSH_MOCK === "1") {
    console.log(`[push:mock] ${JSON.stringify({ userId, ...payload })}`);
    return { devices: subs.length, sent: subs.length, failed: 0 };
  }

  const keys = await vapidKeys();
  const body = JSON.stringify(payload);
  const results = await Promise.all(
    subs.map(async (s) => {
      try {
        await sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
          vapidDetails: { subject: vapidSubject(), publicKey: keys.publicKey, privateKey: keys.privateKey },
          TTL: 60 * 60 * 24,
          urgency: "normal",
          timeout: 10_000,
        });
        await sql`update push_subscriptions set last_ok_at = now(), fail_count = 0 where id = ${s.id}`;
        return true;
      } catch (e) {
        const status = e instanceof WebPushError ? e.statusCode : 0;
        console.error(`[push] ${status || "error"} ${new URL(s.endpoint).hostname}: ${e instanceof WebPushError ? e.body : String(e)}`);
        if (status === 404 || status === 410) {
          // 手机取消了通知、或换了新的订阅：这个旧的不能用了
          await sql`delete from push_subscriptions where id = ${s.id}`;
        } else {
          await sql`update push_subscriptions set fail_count = fail_count + 1 where id = ${s.id}`;
          await sql`delete from push_subscriptions where id = ${s.id} and fail_count >= 20`;
        }
        return false;
      }
    }),
  );
  const sent = results.filter(Boolean).length;
  return { devices: subs.length, sent, failed: subs.length - sent };
}
