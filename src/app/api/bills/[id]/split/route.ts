import { handle, zId } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { splitUnclaimedEqually } from "@/lib/server/mutations";

export async function POST(_req: Request, ctx: RouteContext<"/api/bills/[id]/split">) {
  return handle(async () => {
    await requireUser();
    const { id } = await ctx.params;
    await splitUnclaimedEqually(zId.parse(id));
    return { ok: true };
  });
}
