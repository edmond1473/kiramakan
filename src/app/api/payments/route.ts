import { z } from "zod";
import { body, handle, zId } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { recordPayment } from "@/lib/server/mutations";

const Schema = z.object({
  fromPersonId: zId,
  toPersonId: zId,
  amountCents: z.number().int().positive().max(100_000_000),
  paidAt: z.iso.datetime({ offset: true }).nullable().optional(),
  note: z.string().max(200).nullable().optional(),
});

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const id = await recordPayment(await body(req, Schema), user);
    return { id };
  });
}
