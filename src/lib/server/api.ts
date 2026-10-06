import "server-only";
import { z } from "zod";
import { HttpError } from "./auth";

/** 统一处理 API 错误：HttpError → 对应 status；zod 错误 → 400；其他 → 500 */
export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    const out = await fn();
    if (out instanceof Response) return out;
    return Response.json(out ?? { ok: true });
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError) {
      return Response.json({ error: "资料格式不对", details: e.issues.map((i) => i.message) }, { status: 400 });
    }
    console.error(e);
    const msg = e instanceof Error ? e.message : "出错了";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function body<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new HttpError(400, "资料格式不对");
  }
  return schema.parse(json);
}

export const zId = z.uuid();
export const zCents = z.number().int().min(-100_000_000).max(100_000_000);
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const zName = z.string().trim().min(1).max(80);
