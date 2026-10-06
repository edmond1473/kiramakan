import { z } from "zod";
import { body, handle, zId } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { offsetWith } from "@/lib/server/mutations";

const Schema = z.object({ otherPersonId: zId });

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const { otherPersonId } = await body(req, Schema);
    const amount = await offsetWith(user, otherPersonId);
    return { amount };
  });
}
