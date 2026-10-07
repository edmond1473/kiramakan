import { handle } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { checkProviders } from "@/lib/server/ocr";

export const maxDuration = 60;

/** 设定页的「检查 AI」：key 有没有效、每个模型能不能用、DeepSeek 余额（key 不会传到浏览器） */
export async function POST() {
  return handle(async () => {
    await requireUser();
    return { providers: await checkProviders() };
  });
}
