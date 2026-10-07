import { z } from "zod";
import { body, handle } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { testNotice } from "@/lib/server/incoming";

const Schema = z.object({ text: z.string().trim().min(1).max(2000) });

/** 设定页「试一试」：贴通知文字，看会怎么处理（不会记账） */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const { text } = await body(req, Schema);
    const r = await testNotice(user, text);
    return {
      amountCents: r.amountCents,
      sender: r.sender,
      direction: r.direction,
      outcome: r.outcome,
      personName: r.personName,
      summary: r.summary,
    };
  });
}
