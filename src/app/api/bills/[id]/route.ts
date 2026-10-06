import { z } from "zod";
import { body, handle, zCents, zDate, zId } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { deleteBill, updateBillMeta } from "@/lib/server/mutations";

const Patch = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  billDate: zDate.optional(),
  payerPersonId: zId.optional(),
  totalCents: zCents.refine((v) => v > 0, "总额要大过 0").optional(),
  locked: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: RouteContext<"/api/bills/[id]">) {
  return handle(async () => {
    await requireUser();
    const { id } = await ctx.params;
    await updateBillMeta(zId.parse(id), await body(req, Patch));
    return { ok: true };
  });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/bills/[id]">) {
  return handle(async () => {
    await requireUser();
    const { id } = await ctx.params;
    await deleteBill(zId.parse(id));
    return { ok: true };
  });
}
