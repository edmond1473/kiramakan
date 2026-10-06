import { cookies } from "next/headers";
import { z } from "zod";
import { body, handle } from "@/lib/server/api";
import { createSessionValue, HttpError, SESSION_COOKIE, verifyPassword } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

const Schema = z.object({ username: z.string().trim().min(1).max(40), password: z.string().min(1).max(200) });

export async function POST(req: Request) {
  return handle(async () => {
    const { username, password } = await body(req, Schema);
    const sql = await db();
    const rows = await sql`select id, password_hash from users where username = ${username.toLowerCase()}`;
    const ok = rows.length > 0 && (await verifyPassword(password, rows[0].password_hash));
    if (!ok) {
      await new Promise((r) => setTimeout(r, 400));
      throw new HttpError(401, "登入名或密码不对");
    }
    const s = await createSessionValue(rows[0].id);
    (await cookies()).set(SESSION_COOKIE, s.value, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: s.maxAge,
      path: "/",
    });
    return { ok: true };
  });
}
