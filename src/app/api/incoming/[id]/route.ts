import { z } from "zod";
import { body, handle, zId } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { assignIncoming, ignoreIncoming, undoIncoming } from "@/lib/server/incoming";

const Schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("assign"),
    personId: zId,
    amountCents: z.number().int().positive().max(100_000_000).nullable().optional(),
  }),
  z.object({ action: z.literal("ignore") }),
  z.object({ action: z.literal("undo") }),
]);

/** 待确认的 TNG 进账：选是谁 / 不是还钱 / 撤销自动记录 */
export async function POST(req: Request, ctx: RouteContext<"/api/incoming/[id]">) {
  return handle(async () => {
    const user = await requireUser();
    const id = zId.parse((await ctx.params).id);
    const input = await body(req, Schema);
    if (input.action === "assign") {
      const r = await assignIncoming(user, id, input.personId, input.amountCents);
      return { ok: true, message: r.verdict.message, name: r.name, amount: r.amount };
    }
    if (input.action === "ignore") await ignoreIncoming(user, id);
    else await undoIncoming(user, id);
    return { ok: true };
  });
}
