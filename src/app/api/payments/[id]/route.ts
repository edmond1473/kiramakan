import { handle, zId } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { deletePayment } from "@/lib/server/mutations";

export async function DELETE(_req: Request, ctx: RouteContext<"/api/payments/[id]">) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    await deletePayment(zId.parse(id), user);
    return { ok: true };
  });
}
