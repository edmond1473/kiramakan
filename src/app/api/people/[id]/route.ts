import { z } from "zod";
import { body, handle, zId, zName } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { updatePerson } from "@/lib/server/mutations";

const Patch = z.object({
  name: zName.optional(),
  tngName: z.string().trim().max(80).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: RouteContext<"/api/people/[id]">) {
  return handle(async () => {
    await requireUser();
    const { id } = await ctx.params;
    await updatePerson(zId.parse(id), await body(req, Patch));
    return { ok: true };
  });
}
