import { handle } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { vapidKeys } from "@/lib/server/push";

export const dynamic = "force-dynamic";

/** 浏览器订阅通知要用的公开金钥 */
export async function GET() {
  return handle(async () => {
    await requireUser();
    return { publicKey: (await vapidKeys()).publicKey };
  });
}
