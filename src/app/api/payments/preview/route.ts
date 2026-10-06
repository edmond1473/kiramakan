import { z } from "zod";
import { body, handle, zId } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { previewPayment } from "@/lib/server/mutations";

const Schema = z.object({ fromPersonId: zId, toPersonId: zId, amountCents: z.number().int().positive() });

export async function POST(req: Request) {
  return handle(async () => {
    await requireUser();
    const input = await body(req, Schema);
    return previewPayment(input.fromPersonId, input.toPersonId, input.amountCents);
  });
}
