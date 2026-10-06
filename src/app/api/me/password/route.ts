import { z } from "zod";
import { body, handle } from "@/lib/server/api";
import { HttpError, requireUser, verifyPassword } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { changePassword } from "@/lib/server/mutations";

const Schema = z.object({
  current: z.string().min(1),
  next: z.string().min(6, "新密码最少 6 个字").max(200),
});

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const input = await body(req, Schema);
    const sql = await db();
    const [row] = await sql`select password_hash from users where id = ${user.id}`;
    if (!row || !(await verifyPassword(input.current, row.password_hash))) {
      throw new HttpError(400, "现在的密码不对");
    }
    await changePassword(user, input.next);
    return { ok: true };
  });
}
