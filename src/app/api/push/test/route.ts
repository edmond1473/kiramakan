import { handle } from "@/lib/server/api";
import { HttpError, requireUser } from "@/lib/server/auth";
import { sendPush } from "@/lib/server/push";

/** 发一个测试通知到你所有开了通知的手机 */
export async function POST() {
  return handle(async () => {
    const user = await requireUser();
    const r = await sendPush(user.id, {
      title: "KiraMakan 通知开好了 ✓",
      body: "以后朋友转钱给你、或有人还没还钱，会在这里通知你。",
      url: "/settings",
    });
    if (r.devices === 0) throw new HttpError(400, "这个帐号还没有开通知的手机");
    if (r.sent === 0) throw new HttpError(502, "发不出去，请在手机上关掉通知再重新打开一次");
    return r;
  });
}
