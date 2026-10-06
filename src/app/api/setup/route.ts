import { cookies } from "next/headers";
import { z } from "zod";
import { body, handle, zName } from "@/lib/server/api";
import { createSessionValue, SESSION_COOKIE } from "@/lib/server/auth";
import { createFirstAdmin } from "@/lib/server/mutations";

const Schema = z.object({
  name: zName,
  username: z.string().trim().min(2).max(40).regex(/^[a-zA-Z0-9._-]+$/, "登入名只能用英文字母、数字、. _ -"),
  password: z.string().min(6, "密码最少 6 个字").max(200),
});

export async function POST(req: Request) {
  return handle(async () => {
    const input = await body(req, Schema);
    const userId = await createFirstAdmin(input);
    const s = await createSessionValue(userId);
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
