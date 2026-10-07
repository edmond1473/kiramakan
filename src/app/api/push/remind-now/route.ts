import { handle } from "@/lib/server/api";
import { HttpError, requireUser } from "@/lib/server/auth";
import { remindNow } from "@/lib/server/remind";

export const maxDuration = 30;

/** 马上发一次「谁还没还钱」的提醒 */
export async function POST() {
  return handle(async () => {
    const user = await requireUser();
    const r = await remindNow(user);
    if (r.devices === 0) throw new HttpError(400, "这个帐号还没有开通知的手机");
    if (r.sent === 0) throw new HttpError(502, "发不出去，请在手机上关掉通知再重新打开一次");
    return r;
  });
}
