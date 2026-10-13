import { z } from "zod";
import { body, handle, zId } from "@/lib/server/api";
import { HttpError } from "@/lib/server/auth";
import { cancelClaims, createClaim } from "@/lib/server/claims";
import { DEFAULT_TOLERANCE_CENTS } from "@/lib/ledger";
import { ledgerBetween, loadWorld } from "@/lib/server/world";

// 朋友在「我的账」页按「复制金额，打开 TNG」：先算他把欠这个人的全部付了（待核对）

const Schema = z.object({ creditorId: zId });

async function load(token: string) {
  const w = await loadWorld();
  const person = [...w.people.values()].find((p) => p.token === token);
  if (!person) throw new HttpError(404, "找不到这个 link");
  return { w, person };
}

export async function POST(req: Request, ctx: RouteContext<"/api/p/[token]/pay">) {
  return handle(async () => {
    const { token } = await ctx.params;
    const { creditorId } = await body(req, Schema);
    const { w, person } = await load(token);
    const creditor = w.people.get(creditorId);
    if (!creditor) throw new HttpError(404, "找不到这个人");
    const balance = ledgerBetween(w, person.id, creditorId).balance;
    if (creditor.userId && balance > DEFAULT_TOLERANCE_CENTS) {
      await createClaim({ fromPersonId: person.id, toPersonId: creditorId, amountCents: balance, billId: null });
    }
    return { ok: true };
  });
}

/** 「其实还没付」：取消给这个人的全部「去付款」 */
export async function DELETE(req: Request, ctx: RouteContext<"/api/p/[token]/pay">) {
  return handle(async () => {
    const { token } = await ctx.params;
    const { creditorId } = await body(req, Schema);
    const { person } = await load(token);
    await cancelClaims(person.id, creditorId, null);
    return { ok: true };
  });
}
