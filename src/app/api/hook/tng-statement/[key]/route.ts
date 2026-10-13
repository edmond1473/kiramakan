import { after } from "next/server";
import { handle } from "@/lib/server/api";
import { HttpError } from "@/lib/server/auth";
import { userByWebhookKey } from "@/lib/server/incoming";
import { sendPush } from "@/lib/server/push";
import { ingestStatement, readStatementPdf, summaryNotice, summaryText } from "@/lib/server/statement";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Gmail 的 Apps Script 收到 TNG 交易记录的 email，把 PDF 原封不动 POST 到这里。
// 网址里的 key 就是密码（跟 iPhone 捷径用的同一个）；PDF 的密码放在 Vercel 的 TNG_PDF_PASSWORD。

const MAX_BYTES = 5_000_000;

export async function POST(req: Request, ctx: RouteContext<"/api/hook/tng-statement/[key]">) {
  return handle(async () => {
    const { key } = await ctx.params;
    const user = await userByWebhookKey(key);
    if (!user) throw new HttpError(404, "网址不对（可能已经换了新的网址）");
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.length === 0) throw new HttpError(400, "没有收到 PDF");
    if (bytes.length > MAX_BYTES) throw new HttpError(413, "PDF 太大");
    const st = await readStatementPdf(bytes, process.env.TNG_PDF_PASSWORD || undefined);
    const s = await ingestStatement(user, st);
    console.log(`[statement] ${user.username} ${summaryText(s)}`);
    const notice = summaryNotice(s);
    if (notice) {
      after(async () => {
        try {
          await sendPush(user.id, notice);
        } catch (e) {
          console.error("[statement] push failed", e);
        }
      });
    }
    return { ok: true, message: summaryText(s), ...s };
  });
}
