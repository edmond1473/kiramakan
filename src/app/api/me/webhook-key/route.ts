import { handle } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { rotateWebhookKey } from "@/lib/server/incoming";

/** 换一个新的进账网址（旧的马上失效，iPhone 捷径要改成新的） */
export async function POST() {
  return handle(async () => {
    const user = await requireUser();
    return { key: await rotateWebhookKey(user.id) };
  });
}
