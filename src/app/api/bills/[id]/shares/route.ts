import { z } from "zod";
import { body, handle, zId } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { setItemShares } from "@/lib/server/mutations";

const Schema = z.object({
  itemId: zId,
  shares: z.array(z.object({ personId: zId, units: z.number().int().min(0).max(999) })).max(50),
});

export async function PUT(req: Request, ctx: RouteContext<"/api/bills/[id]/shares">) {
  return handle(async () => {
    await requireUser();
    const { id } = await ctx.params;
    const input = await body(req, Schema);
    await setItemShares(zId.parse(id), input.itemId, input.shares);
    return { ok: true };
  });
}
