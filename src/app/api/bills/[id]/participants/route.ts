import { z } from "zod";
import { body, handle, zId, zName } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { addParticipants, findOrCreatePerson, removeParticipant } from "@/lib/server/mutations";

const Add = z.object({ personIds: z.array(zId).max(50).default([]), names: z.array(zName).max(20).default([]) });
const Remove = z.object({ personId: zId });

export async function POST(req: Request, ctx: RouteContext<"/api/bills/[id]/participants">) {
  return handle(async () => {
    await requireUser();
    const { id } = await ctx.params;
    const input = await body(req, Add);
    const created: string[] = [];
    for (const n of input.names) created.push(await findOrCreatePerson(n));
    await addParticipants(zId.parse(id), [...input.personIds, ...created]);
    return { ok: true, created };
  });
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/bills/[id]/participants">) {
  return handle(async () => {
    await requireUser();
    const { id } = await ctx.params;
    const { personId } = await body(req, Remove);
    await removeParticipant(zId.parse(id), personId);
    return { ok: true };
  });
}
