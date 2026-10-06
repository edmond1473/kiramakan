import { z } from "zod";
import { body, handle, zId } from "@/lib/server/api";
import { HttpError } from "@/lib/server/auth";
import { claimItem } from "@/lib/server/mutations";
import { billByToken, billView, loadWorld } from "@/lib/server/world";

const Schema = z.object({ personId: zId, itemId: zId, units: z.number().int().min(0).max(99) });

export async function POST(req: Request, ctx: RouteContext<"/api/share/[token]/claim">) {
  return handle(async () => {
    const { token } = await ctx.params;
    const input = await body(req, Schema);
    const w = await loadWorld();
    const b = billByToken(w, token);
    if (!b) throw new HttpError(404, "找不到这张单");
    if (b.locked) throw new HttpError(409, "这张单已经锁定，不能再改，请找付钱的人");
    const view = billView(w, b.id)!;
    if (!view.participants.some((p) => p.personId === input.personId)) {
      throw new HttpError(403, "你不在这张单的名单里");
    }
    await claimItem(b.id, input.itemId, input.personId, input.units);
    return billView(await loadWorld(), b.id);
  });
}
