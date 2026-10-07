import { after } from "next/server";
import { handle } from "@/lib/server/api";
import { HttpError } from "@/lib/server/auth";
import { ingestNotice, markEmptyHook, userByWebhookKey, type IngestResult } from "@/lib/server/incoming";
import { sendPush } from "@/lib/server/push";
import { noticeText } from "@/lib/tng-notify";
import { formatRM } from "@/lib/money";

export const dynamic = "force-dynamic";

// iPhone 捷径（「收到 TNG 通知时」自动化 →「获取 URL 内容」）把通知内容 POST 到这里。
// 网址里的 key 就是密码：只有你的捷径知道。

const MAX_BYTES = 20_000;

/** 捷径可能用 JSON、表单或纯文字传过来，全部接受 */
async function readNotice(req: Request): Promise<string> {
  const parts: unknown[] = [];
  const url = new URL(req.url);
  for (const k of ["text", "t", "title", "body"]) {
    const v = url.searchParams.get(k);
    if (v) parts.push(v);
  }
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("multipart/form-data")) {
    const form = await req.formData();
    parts.push([...form.entries()].map(([, v]) => (typeof v === "string" ? v : "")));
  } else {
    const raw = await req.text();
    if (raw.length > MAX_BYTES) throw new HttpError(413, "内容太长");
    const trimmed = raw.trim();
    if (trimmed) {
      if (type.includes("application/x-www-form-urlencoded")) {
        parts.push(Object.fromEntries(new URLSearchParams(trimmed)));
      } else if (type.includes("json") || /^[[{"]/.test(trimmed)) {
        try {
          parts.push(JSON.parse(trimmed));
        } catch {
          parts.push(trimmed);
        }
      } else {
        parts.push(trimmed);
      }
    }
  }
  return noticeText(parts);
}

function reply(r: IngestResult): string {
  const amt = r.amountCents ? formatRM(r.amountCents) : "";
  switch (r.status) {
    case "recorded":
      return r.linkedManual ? `你已经手动记过 ${r.personName} 的 ${amt}` : `已记录：${r.personName} 还你 ${amt}`;
    case "pending":
      return `收到 ${amt}，放在「待确认」`;
    case "duplicate":
      return "这个通知刚刚收过了";
    case "unparsed":
      return "看不到金额，没有记录";
    case "ignored":
      return "不是朋友转账，没有记录";
  }
}

export async function POST(req: Request, ctx: RouteContext<"/api/hook/tng/[key]">) {
  return handle(async () => {
    const { key } = await ctx.params;
    const user = await userByWebhookKey(key);
    if (!user) throw new HttpError(404, "网址不对（可能已经换了新的网址）");
    const text = await readNotice(req);
    if (!text) {
      await markEmptyHook(user.id);
      throw new HttpError(400, "没有收到通知内容。捷径里「请求体」要放通知的内容。");
    }
    const r = await ingestNotice(user, text);
    console.log(
      `[tng] ${user.username} ${r.status}${r.reason ? `/${r.reason}` : ""} ${r.direction} ${r.amountCents ?? "-"} ${r.personId ? "matched" : "no-match"}`,
    );
    const notify = r.notify;
    if (notify) {
      after(async () => {
        try {
          await sendPush(user.id, { title: notify.title, body: notify.body, url: notify.url });
        } catch (e) {
          console.error("[tng] push failed", e);
        }
      });
    }
    return { ok: true, status: r.status, message: reply(r) };
  });
}

/** 在浏览器打开这个网址：确认网址是对的 */
export async function GET(_req: Request, ctx: RouteContext<"/api/hook/tng/[key]">) {
  return handle(async () => {
    const { key } = await ctx.params;
    const user = await userByWebhookKey(key);
    if (!user) throw new HttpError(404, "网址不对（可能已经换了新的网址）");
    return { ok: true, message: `连上了 ✓（${user.name}）。这个网址是给 iPhone 捷径用的，要用 POST 传通知内容。` };
  });
}
