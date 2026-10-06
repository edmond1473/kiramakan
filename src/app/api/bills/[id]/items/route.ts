import { z } from "zod";
import { isBillBalanced } from "@/lib/receipt";
import { body, handle, zCents, zId, zName } from "@/lib/server/api";
import { HttpError, requireUser } from "@/lib/server/auth";
import { replaceItems, updateBillMeta } from "@/lib/server/mutations";

const Schema = z.object({
  items: z
    .array(z.object({ id: zId.optional(), name: zName, qty: z.number().positive().max(9999), lineCents: zCents }))
    .max(200),
  charges: z.array(z.object({ label: z.string().trim().min(1).max(80), amountCents: zCents })).max(30),
  totalCents: zCents.refine((v) => v > 0, "总额要大过 0"),
});

export async function PUT(req: Request, ctx: RouteContext<"/api/bills/[id]/items">) {
  return handle(async () => {
    await requireUser();
    const { id } = await ctx.params;
    const billId = zId.parse(id);
    const input = await body(req, Schema);
    if (!isBillBalanced(input.items, input.charges, input.totalCents)) {
      throw new HttpError(400, "item 加 charges 要刚好等于总额，请回去核对");
    }
    await replaceItems(billId, input.items, input.charges);
    await updateBillMeta(billId, { totalCents: input.totalCents });
    return { ok: true };
  });
}
