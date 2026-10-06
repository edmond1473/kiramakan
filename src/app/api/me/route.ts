import { z } from "zod";
import { body, handle, zName } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { updateMe } from "@/lib/server/mutations";

const Patch = z.object({
  name: zName.optional(),
  tngName: z.string().trim().max(80).nullable().optional(),
  qrPayload: z.string().max(1000).nullable().optional(),
  qrAmountEnabled: z.boolean().optional(),
  payPhone: z.string().trim().max(30).nullable().optional(),
});

export async function PATCH(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    await updateMe(user, await body(req, Patch));
    return { ok: true };
  });
}
