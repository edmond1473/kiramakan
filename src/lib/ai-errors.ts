// 把 AI 服务回的错误变成看得懂的原因（读 receipt 和「检查 AI」共用）

export type FailKind =
  | "key" // API key 无效或没有权限
  | "balance" // 帐号没有余额（DeepSeek 402）
  | "quota" // 次数到上限（429）
  | "missing" // 模型不存在或已停用（404）
  | "format" // 不支持这种 JSON 格式，换一种再试
  | "rejected" // 其他被拒绝的请求（400 等）
  | "server" // 对方服务出错（5xx）
  | "empty" // 回传空白
  | "unreadable" // 回传的不是看得懂的 JSON
  | "timeout"
  | "network";

export interface Failure {
  kind: FailKind;
  status?: number;
  /** 对方回的错误讯息（已截短），写进 log 和画面方便排查 */
  detail?: string | null;
}

/** 从回应内容拿出错误讯息：OpenAI 格式 {"error":{"message"}}，Gemini 有时包在 array 里 */
export function apiErrorMessage(body: string): string | null {
  const clean = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 240) || null;
  try {
    const j = JSON.parse(body) as unknown;
    const first = Array.isArray(j) ? j[0] : j;
    const err = first && typeof first === "object" ? (first as { error?: unknown }).error : undefined;
    if (typeof err === "string") return clean(err);
    if (err && typeof err === "object") {
      const m = (err as { message?: unknown }).message;
      if (typeof m === "string") return clean(m);
    }
    const m = first && typeof first === "object" ? (first as { message?: unknown }).message : undefined;
    return typeof m === "string" ? clean(m) : null;
  } catch {
    return clean(body);
  }
}

/** 按 HTTP 状态和内容分类；先看状态码，避免 429 讯息里提到 api_key 被当成 key 错误 */
export function classifyHttp(status: number, body: string): Failure {
  const detail = apiErrorMessage(body);
  if (status === 429) return { kind: "quota", status, detail };
  if (status === 402) return { kind: "balance", status, detail };
  if (status === 404) return { kind: "missing", status, detail };
  // 被公司网络 / proxy 挡住也会回 403，那不是 key 的问题
  if (status === 403 && /allowlist|egress|proxy|firewall/i.test(body)) return { kind: "network", status, detail };
  if (status === 401 || status === 403) return { kind: "key", status, detail };
  if (status >= 500) return { kind: "server", status, detail };
  if (/api[_ ]?key|invalid_api_key|authenticat|unauthori[sz]ed/i.test(body)) return { kind: "key", status, detail };
  if (/insufficient[_ ]balance/i.test(body)) return { kind: "balance", status, detail };
  if (/response_format|json_schema|json_object|structured output|schema/i.test(body)) return { kind: "format", status, detail };
  if (/model[\s\S]*?(not (be )?found|not exist|not supported|deprecat|unavailable)/i.test(body)) {
    return { kind: "missing", status, detail };
  }
  return { kind: "rejected", status, detail };
}

/** 给人看的一句话 */
export function failureText(f: Failure): string {
  switch (f.kind) {
    case "key":
      return "API key 无效或没有权限";
    case "balance":
      return "帐号没有余额";
    case "quota":
      return "次数到上限了（可能是今天的免费次数用完）";
    case "missing":
      return "这个模型不能用（可能已停用）";
    case "format":
      return "不支持要求的 JSON 格式";
    case "server":
      return `对方服务暂时出错（HTTP ${f.status ?? "5xx"}）`;
    case "empty":
      return "回传空白";
    case "unreadable":
      return "回传的格式看不懂";
    case "timeout":
      return "太久没回应";
    case "network":
      return "连不上";
    case "rejected":
      return `请求被拒绝（HTTP ${f.status ?? "?"}${f.detail ? `：${f.detail.slice(0, 120)}` : ""}）`;
  }
}

/** 整家 AI 都失败时的说明：每个模型写出最后的原因 */
export function summarizeAttempts(attempts: (Failure & { model: string })[]): string {
  if (attempts.length === 0) return "没有可用的模型";
  const fatal = attempts.find((a) => a.kind === "key" || a.kind === "balance");
  if (fatal) return failureText(fatal);
  const byModel = new Map<string, Failure>();
  for (const a of attempts) {
    const prev = byModel.get(a.model);
    // 同一个模型试了几种格式：用最后一个「不是格式问题」的原因
    if (!prev || prev.kind === "format" || a.kind !== "format") byModel.set(a.model, a);
  }
  return [...byModel.entries()].map(([model, f]) => `${model} ${failureText(f)}`).join("，");
}
