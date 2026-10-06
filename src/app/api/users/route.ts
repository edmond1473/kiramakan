import { z } from "zod";
import { body, handle, zId, zName } from "@/lib/server/api";
import { HttpError, requireUser } from "@/lib/server/auth";
import { createPayerAccount } from "@/lib/server/mutations";

const Schema = z.object({
  personId: zId.nullable().optional(),
  name: zName.nullable().optional(),
  username: z.string().trim().min(2).max(40).regex(/^[a-zA-Z0-9._-]+$/, "登入名只能用英文字母、数字、. _ -"),
  password: z.string().min(6, "密码最少 6 个字").max(200),
});

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    if (!user.isAdmin) throw new HttpError(403, "只有管理员可以开帐号");
    await createPayerAccount(await body(req, Schema));
    return { ok: true };
  });
}
