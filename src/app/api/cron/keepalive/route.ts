import { handle } from "@/lib/server/api";
import { HttpError } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

export const dynamic = "force-dynamic";

// Vercel 每天叫一次（vercel.json 的 crons），让 Supabase 免费版不会因为一个星期没人用而暂停。
export async function GET(req: Request) {
  return handle(async () => {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
      throw new HttpError(401, "unauthorized");
    }
    const sql = await db();
    const [row] = await sql`select count(*)::int as bills from bills`;
    return { ok: true, bills: row.bills, at: new Date().toISOString() };
  });
}
