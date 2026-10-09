import { z } from "zod";
import { body, handle } from "@/lib/server/api";
import { HttpError, requireUser } from "@/lib/server/auth";
import { OcrUnavailableError } from "@/lib/server/ocr";
import { readVoice } from "@/lib/server/voice";

export const maxDuration = 120;

// 录音：手机先转成 16kHz 单声道 WAV（base64），一分钟大约 2.6MB
const Schema = z.union([
  z.object({ audio: z.string().min(100).max(3_500_000, "录音太长，一次讲一分钟以内").regex(/^[A-Za-z0-9+/]+=*$/, "录音格式不对") }),
  z.object({ text: z.string().trim().min(2, "多打几个字").max(2000, "太长了") }),
]);

export async function POST(req: Request) {
  return handle(async () => {
    await requireUser();
    const input = await body(req, Schema);
    try {
      return await readVoice("audio" in input ? { audioWavBase64: input.audio } : { text: input.text });
    } catch (e) {
      if (e instanceof OcrUnavailableError) throw new HttpError(503, e.message);
      throw e;
    }
  });
}
