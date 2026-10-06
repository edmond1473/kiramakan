import { handle, zId } from "@/lib/server/api";
import { HttpError, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/bills/[id]/receipt">) {
  return handle(async () => {
    await requireUser();
    const { id } = await ctx.params;
    const sql = await db();
    const rows = await sql`select receipt_image, receipt_mime from bills where id = ${zId.parse(id)}`;
    if (!rows[0]?.receipt_image) throw new HttpError(404, "这张单没有照片");
    return new Response(new Uint8Array(rows[0].receipt_image), {
      headers: { "content-type": rows[0].receipt_mime ?? "image/jpeg", "cache-control": "private, max-age=3600" },
    });
  });
}
