import { z } from "zod";
import { body, handle } from "@/lib/server/api";
import { HttpError, requireUser } from "@/lib/server/auth";
import { OcrUnavailableError, readReceipt } from "@/lib/server/ocr";

export const maxDuration = 120;

const Schema = z.object({
  image: z
    .string()
    .max(6_000_000, "照片太大")
    .regex(/^data:image\/(jpeg|png|webp);base64,/, "只支持 JPG / PNG / WebP"),
});

export async function POST(req: Request) {
  return handle(async () => {
    await requireUser();
    const { image } = await body(req, Schema);
    try {
      return await readReceipt(image);
    } catch (e) {
      if (e instanceof OcrUnavailableError) throw new HttpError(503, e.message);
      throw e;
    }
  });
}
