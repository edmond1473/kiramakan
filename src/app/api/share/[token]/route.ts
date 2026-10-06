import { handle } from "@/lib/server/api";
import { HttpError } from "@/lib/server/auth";
import { billByToken, billView, loadWorld } from "@/lib/server/world";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/share/[token]">) {
  return handle(async () => {
    const { token } = await ctx.params;
    const w = await loadWorld();
    const b = billByToken(w, token);
    if (!b) throw new HttpError(404, "找不到这张单（link 可能错了）");
    return billView(w, b.id);
  });
}
