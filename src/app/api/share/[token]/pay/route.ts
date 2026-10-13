import { z } from "zod";
import { body, handle, zId } from "@/lib/server/api";
import { HttpError } from "@/lib/server/auth";
import { cancelClaims, createClaim } from "@/lib/server/claims";
import { DEFAULT_TOLERANCE_CENTS } from "@/lib/ledger";
import { billByToken, billView, loadWorld } from "@/lib/server/world";

// 朋友在账单页按「去付款」（打开 TNG）：先算他付了这一餐（待核对），晚上 TNG 交易记录有这笔才算数

const Schema = z.object({ personId: zId });

async function load(token: string, personId: string) {
  const w = await loadWorld();
  const b = billByToken(w, token);
  if (!b) throw new HttpError(404, "找不到这张单");
  const view = billView(w, b.id)!;
  const me = view.participants.find((p) => p.personId === personId);
  if (!me) throw new HttpError(403, "你不在这张单的名单里");
  return { b, view, me };
}

export async function POST(req: Request, ctx: RouteContext<"/api/share/[token]/pay">) {
  return handle(async () => {
    const { token } = await ctx.params;
    const { personId } = await body(req, Schema);
    const { b, view, me } = await load(token, personId);
    // 付钱的人没有帐号（没有人会核对）、或已经付清了：不用记
    if (me.isPayer || !view.payer.hasAccount || me.remaining <= DEFAULT_TOLERANCE_CENTS) return view;
    await createClaim({ fromPersonId: personId, toPersonId: b.payerPersonId, amountCents: me.remaining, billId: b.id });
    return billView(await loadWorld(), b.id);
  });
}

/** 「其实还没付」：取消这一餐的 */
export async function DELETE(req: Request, ctx: RouteContext<"/api/share/[token]/pay">) {
  return handle(async () => {
    const { token } = await ctx.params;
    const { personId } = await body(req, Schema);
    const { b } = await load(token, personId);
    await cancelClaims(personId, b.payerPersonId, b.id);
    return billView(await loadWorld(), b.id);
  });
}
