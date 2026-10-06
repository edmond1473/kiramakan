import { z } from "zod";
import { body, handle, zName } from "@/lib/server/api";
import { HttpError } from "@/lib/server/auth";
import { addParticipants, findOrCreatePerson } from "@/lib/server/mutations";
import { billByToken, billView, loadWorld } from "@/lib/server/world";

const Schema = z.object({ name: zName });

export async function POST(req: Request, ctx: RouteContext<"/api/share/[token]/join">) {
  return handle(async () => {
    const { token } = await ctx.params;
    const { name } = await body(req, Schema);
    const w = await loadWorld();
    const b = billByToken(w, token);
    if (!b) throw new HttpError(404, "找不到这张单");
    if (b.locked) throw new HttpError(409, "这张单已经锁定，请找付钱的人帮你加");
    const personId = await findOrCreatePerson(name);
    await addParticipants(b.id, [personId]);
    return { personId, view: billView(await loadWorld(), b.id) };
  });
}
