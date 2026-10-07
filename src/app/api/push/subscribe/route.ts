import { z } from "zod";
import { body, handle } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { removeSubscription, saveSubscription } from "@/lib/server/push";

const Sub = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    await saveSubscription(user.id, await body(req, Sub), req.headers.get("user-agent"));
    return { ok: true };
  });
}

export async function DELETE(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const { endpoint } = await body(req, z.object({ endpoint: z.string().max(1000) }));
    await removeSubscription(user.id, endpoint);
    return { ok: true };
  });
}
