import { z } from "zod";
import { body, handle } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { ingestStatement, readStatementPdf, summaryText } from "@/lib/server/statement";

export const maxDuration = 60;

// 设定页手动上传 TNG 交易记录 PDF（不想等 Gmail 的时候）
const Schema = z.object({
  pdf: z.string().min(100).max(7_000_000, "PDF 太大").regex(/^[A-Za-z0-9+/]+=*$/, "PDF 格式不对"),
  password: z.string().max(100).optional(),
});

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const { pdf, password } = await body(req, Schema);
    const st = await readStatementPdf(new Uint8Array(Buffer.from(pdf, "base64")), password?.trim() || process.env.TNG_PDF_PASSWORD || undefined);
    const s = await ingestStatement(user, st);
    return { message: summaryText(s), ...s };
  });
}
