import { z } from "zod";
import { isBillBalanced } from "@/lib/receipt";
import { body, handle, zCents, zDate, zId, zName } from "@/lib/server/api";
import { HttpError, requireUser } from "@/lib/server/auth";
import { createBill } from "@/lib/server/mutations";

export const maxDuration = 30;

const Schema = z.object({
  title: z.string().trim().min(1).max(120),
  billDate: zDate,
  payerPersonId: zId,
  totalCents: zCents.refine((v) => v > 0, "总额要大过 0"),
  printedSubtotalCents: zCents.nullable(),
  items: z
    .array(z.object({ name: zName, qty: z.number().positive().max(9999), lineCents: zCents }))
    .max(200),
  charges: z.array(z.object({ label: z.string().trim().min(1).max(80), amountCents: zCents })).max(30),
  participantIds: z.array(zId).max(50),
  image: z
    .string()
    .regex(/^data:image\/(jpeg|png|webp);base64,/)
    .max(6_000_000)
    .nullable()
    .optional(),
  ocrRaw: z.unknown().optional(),
});

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const input = await body(req, Schema);
    if (!isBillBalanced(input.items, input.charges, input.totalCents)) {
      throw new HttpError(400, "item 加 charges 要刚好等于总额，请回去核对");
    }
    let imageBase64: string | null = null;
    let imageMime: string | null = null;
    if (input.image) {
      const m = /^data:(image\/[a-z]+);base64,(.*)$/.exec(input.image);
      if (m) {
        imageMime = m[1];
        imageBase64 = m[2];
      }
    }
    const id = await createBill(
      {
        title: input.title,
        billDate: input.billDate,
        payerPersonId: input.payerPersonId,
        totalCents: input.totalCents,
        printedSubtotalCents: input.printedSubtotalCents,
        items: input.items,
        charges: input.charges,
        participantIds: input.participantIds,
        imageBase64,
        imageMime,
        ocrRaw: input.ocrRaw,
      },
      user,
    );
    return { id };
  });
}
