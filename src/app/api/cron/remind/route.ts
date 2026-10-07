import { handle } from "@/lib/server/api";
import { HttpError } from "@/lib/server/auth";
import { runScheduledReminders } from "@/lib/server/remind";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel 每天晚上叫一次（vercel.json 的 crons）。每个人按自己的设定：每天 / 每两天提醒一次。
export async function GET(req: Request) {
  return handle(async () => {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
      throw new HttpError(401, "unauthorized");
    }
    const results = await runScheduledReminders();
    console.log(`[cron:remind] ${JSON.stringify(results)}`);
    return { ok: true, results };
  });
}
