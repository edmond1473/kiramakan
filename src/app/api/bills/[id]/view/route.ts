import { handle, zId } from "@/lib/server/api";
import { HttpError, requireUser } from "@/lib/server/auth";
import { billView, loadWorld } from "@/lib/server/world";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/bills/[id]/view">) {
  return handle(async () => {
    await requireUser();
    const { id } = await ctx.params;
    const view = billView(await loadWorld(), zId.parse(id));
    if (!view) throw new HttpError(404, "找不到这张单");
    return view;
  });
}
