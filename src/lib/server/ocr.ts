import "server-only";
import { z } from "zod";
import { classifyHttp, summarizeAttempts, failureText, type Failure } from "../ai-errors";
import { rmToCents } from "../money";
import { checkDraft } from "../receipt";
import {
  crossCheck,
  type CrossCheck,
  type ProviderId,
  type ProviderOutcome,
  type ReadResult,
} from "../receipt-compare";

// 读 receipt：Gemini、DeepSeek（还有可选的 OpenAI）同时读，结果互相比对。
// AI 只负责「看」，所有加减乘除都在 money.ts 用 code 算。

export interface ReceiptDraft {
  merchant: string | null;
  date: string | null;
  items: { name: string; qty: number; lineCents: number }[];
  charges: { label: string; amountCents: number }[];
  printedSubtotalCents: number | null;
  totalCents: number;
  notes: string | null;
  warnings: string[];
  crossCheck: CrossCheck;
  /** 存进资料库方便以后查：每个 AI 读到的原始结果 */
  raw: { outcomes: ProviderOutcome[] };
}

export class OcrUnavailableError extends Error {}

const SYSTEM_PROMPT = `You read photos of restaurant / cafe / hawker receipts from Malaysia (currency RM / MYR) and return ONLY a JSON object, no other text.

JSON shape:
{"merchant": string, "date": string, "items": [{"name": string, "qty": number, "line_total": number}], "charges": [{"label": string, "amount": number}], "subtotal": number, "total": number, "notes": string}

Rules:
- items: every food or drink line that was purchased. "name" as printed (keep the original language; fix obvious OCR mistakes). "qty" as printed (1 if not shown). "line_total" is the amount printed for that line, which already equals qty x unit price.
- Never put subtotal, service charge, SST / service tax / GST / tax, rounding, discounts, vouchers, totals, payment method, cash tendered or change into items.
- If an add-on / modifier line (for example "+ Telur", "Add cheese", "Upsize") has its own price, merge it into the item it belongs to: add its price to that item's line_total and append " + <modifier>" to that item's name.
- If the same dish appears on several lines, keep the lines separate.
- charges: service charge, SST / service tax / GST, rounding adjustment, delivery / packaging fees and discounts / vouchers, each with the label as printed and a signed amount (discounts are negative, rounding can be negative).
- subtotal: the printed subtotal before charges, or 0 if none is printed.
- total: the final amount payable (Grand Total / Total / Nett Total / Amount Due), after rounding. If several totals are printed, use the final payable one.
- merchant: the shop name, or "" if not printed. date: YYYY-MM-DD if printed, else "".
- Read every digit carefully; amounts must match the receipt exactly.
- notes: "" normally; if the photo is not a receipt or is unreadable, return empty items, total 0 and explain briefly here.`;

// 各家都能接受的 JSON schema（不用 null / union type）
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    merchant: { type: "string" },
    date: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          qty: { type: "number" },
          line_total: { type: "number" },
        },
        required: ["name", "qty", "line_total"],
      },
    },
    charges: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { label: { type: "string" }, amount: { type: "number" } },
        required: ["label", "amount"],
      },
    },
    subtotal: { type: "number" },
    total: { type: "number" },
    notes: { type: "string" },
  },
  required: ["merchant", "date", "items", "charges", "subtotal", "total", "notes"],
} as const;

type Format = "json_schema" | "json_object" | "none";

interface ProviderConf {
  id: ProviderId;
  label: string;
  url: string;
  key: string | undefined;
  models: string[];
  formats: Format[];
  extra?: Record<string, unknown>;
  imageDetail?: boolean;
}

const list = (v: string | undefined) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : null);

/** 两个都算得通时，优先用这个顺序 */
export const PROVIDER_ORDER: ProviderId[] = ["gemini", "deepseek", "openai"];

function providers(): ProviderConf[] {
  const env = process.env;
  return [
    {
      id: "gemini",
      label: "Gemini",
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      key: env.GEMINI_API_KEY,
      // 3.8 Flash 读得最准，但免费版每天次数很少；用完就换免费次数多很多的 3.5 Flash-Lite
      models: list(env.GEMINI_MODEL) ?? ["gemini-3.8-flash", "gemini-3.5-flash-lite"],
      formats: ["json_schema", "json_object", "none"],
    },
    {
      id: "deepseek",
      label: "DeepSeek",
      url: "https://api.deepseek.com/chat/completions",
      key: env.DEEPSEEK_API_KEY,
      // deepseek-flash 可以读图；旧名字 deepseek-v4-flash-vision-exp 已退役但暂时还接受
      models: list(env.DEEPSEEK_MODEL) ?? ["deepseek-flash", "deepseek-v4-flash-vision-exp"],
      formats: ["json_object", "none"],
      extra: { max_tokens: 4096 },
    },
    {
      id: "openai",
      label: "OpenAI",
      url: "https://api.openai.com/v1/chat/completions",
      key: env.OPENAI_API_KEY,
      models: list(env.OPENAI_MODEL) ?? ["gpt-6-luna", "gpt-5.4-mini", "gpt-5-mini"],
      formats: ["json_schema", "json_object"],
      imageDetail: true,
    },
  ];
}

const num = z.preprocess(
  (v) => (typeof v === "string" ? Number(v.replace(/[^0-9.\-]/g, "")) : v),
  z.number().finite(),
);
const RawSchema = z.object({
  merchant: z.string().nullish(),
  date: z.string().nullish(),
  items: z
    .array(z.object({ name: z.string().nullish(), qty: num.nullish(), line_total: num }))
    .default([]),
  charges: z.array(z.object({ label: z.string().nullish(), amount: num })).default([]),
  subtotal: num.nullish(),
  total: num,
  notes: z.string().nullish(),
});

function extractJson(content: string): unknown {
  const s = content.replace(/```(?:json)?/gi, "").trim();
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("回传的不是 JSON");
  return JSON.parse(s.slice(a, b + 1));
}

function toResult(conf: ProviderConf, model: string, raw: z.infer<typeof RawSchema>): ReadResult {
  const items = raw.items
    .map((i) => ({
      name: (i.name ?? "").trim() || "Item",
      qty: i.qty && i.qty > 0 ? i.qty : 1,
      lineCents: rmToCents(i.line_total),
    }))
    .filter((i) => i.lineCents !== 0);
  const charges = raw.charges
    .map((c) => ({ label: (c.label ?? "").trim() || "Charge", amountCents: rmToCents(c.amount) }))
    .filter((c) => c.amountCents !== 0);
  const date = raw.date && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : null;
  return {
    provider: conf.id,
    label: conf.label,
    model,
    merchant: raw.merchant?.trim() || null,
    date,
    items,
    charges,
    printedSubtotalCents: raw.subtotal && raw.subtotal > 0 ? rmToCents(raw.subtotal) : null,
    totalCents: rmToCents(raw.total),
    notes: raw.notes?.trim() || null,
  };
}

class ProviderError extends Error {}

type Attempt = Failure & { model: string };

function logFailure(conf: ProviderConf, model: string, format: string, f: Failure) {
  // 写进 Vercel 的 log：方便查哪个模型、为什么失败（不会记录 key 或照片）
  console.error(`[ocr] ${conf.id} ${model} (${format}) ${f.kind}${f.status ? ` HTTP ${f.status}` : ""}${f.detail ? `: ${f.detail}` : ""}`);
}

/** 一家 AI：按顺序试模型和 JSON 格式，哪个能用就用哪个；全部失败就说清楚每个模型的原因 */
async function readWith(conf: ProviderConf, imageDataUrl: string): Promise<ReadResult> {
  const attempts: Attempt[] = [];
  for (const model of conf.models) {
    for (const format of conf.formats) {
      const body: Record<string, unknown> = {
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Read this receipt and reply with the JSON object only." },
              {
                type: "image_url",
                image_url: conf.imageDetail ? { url: imageDataUrl, detail: "high" } : { url: imageDataUrl },
              },
            ],
          },
        ],
        ...conf.extra,
      };
      if (format === "json_schema") {
        body.response_format = { type: "json_schema", json_schema: { name: "receipt", strict: true, schema: SCHEMA } };
      } else if (format === "json_object") {
        body.response_format = { type: "json_object" };
      }
      let res: Response;
      try {
        res = await fetch(conf.url, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${conf.key}` },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(45_000),
        });
      } catch (e) {
        const f: Failure = { kind: e instanceof Error && e.name === "TimeoutError" ? "timeout" : "network" };
        logFailure(conf, model, format, f);
        throw new ProviderError(failureText(f));
      }
      if (!res.ok) {
        const f = classifyHttp(res.status, (await res.text()).slice(0, 2000));
        logFailure(conf, model, format, f);
        attempts.push({ ...f, model });
        if (f.kind === "key" || f.kind === "balance") throw new ProviderError(summarizeAttempts(attempts));
        if (f.kind === "format" || f.kind === "rejected") continue; // 换一种 JSON 格式再试
        break; // 次数用完 / 模型不能用 / 服务出错：换下一个模型（各模型额度分开）
      }
      const data = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string | null } }[] } | null;
      const content = data?.choices?.[0]?.message?.content;
      if (!content || !content.trim()) {
        attempts.push({ kind: "empty", model });
        logFailure(conf, model, format, { kind: "empty" });
        continue; // DeepSeek 文件说 JSON 模式偶尔会回空白：换个格式再试
      }
      try {
        return toResult(conf, model, RawSchema.parse(extractJson(content)));
      } catch {
        attempts.push({ kind: "unreadable", model });
        logFailure(conf, model, format, { kind: "unreadable" });
        continue;
      }
    }
  }
  throw new ProviderError(summarizeAttempts(attempts));
}

// ---------- 「检查 AI」：看 key 有没有效、每个模型能不能用、DeepSeek 余额 ----------

export interface ModelCheck {
  model: string;
  ok: boolean;
  text: string;
}

export interface ProviderCheck {
  id: ProviderId;
  label: string;
  configured: boolean;
  /** 至少一个模型能用 */
  ok: boolean;
  message: string;
  models: ModelCheck[];
  balance?: { available: boolean; text: string } | null;
}

async function pingModel(conf: ProviderConf, model: string): Promise<{ ok: true } | { ok: false; failure: Failure }> {
  try {
    const res = await fetch(conf.url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${conf.key}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Reply with the single word OK." }],
        ...(conf.id === "gemini" ? {} : { max_tokens: 8 }),
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (res.ok) return { ok: true };
    const failure = classifyHttp(res.status, (await res.text()).slice(0, 2000));
    logFailure(conf, model, "check", failure);
    return { ok: false, failure };
  } catch (e) {
    return { ok: false, failure: { kind: e instanceof Error && e.name === "TimeoutError" ? "timeout" : "network" } };
  }
}

async function deepseekBalance(conf: ProviderConf): Promise<{ available: boolean; text: string } | null> {
  try {
    const res = await fetch("https://api.deepseek.com/user/balance", {
      headers: { authorization: `Bearer ${conf.key}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      is_available?: boolean;
      balance_infos?: { currency?: string; total_balance?: string; granted_balance?: string; topped_up_balance?: string }[];
    };
    const lines = (j.balance_infos ?? []).map(
      (b) => `${b.currency ?? ""} ${b.total_balance ?? "0"}（充值 ${b.topped_up_balance ?? "0"}，赠送 ${b.granted_balance ?? "0"}）`.trim(),
    );
    return { available: !!j.is_available, text: lines.join("；") || "0" };
  } catch {
    return null;
  }
}

/** 每个有设 key 的 AI：每个模型发一个很短的测试请求（每个模型会用掉 1 次额度） */
export async function checkProviders(): Promise<ProviderCheck[]> {
  if (process.env.OCR_MOCK) return mockChecks();
  const all = providers().filter((p) => p.id !== "openai" || p.key);
  return Promise.all(
    all.map(async (conf): Promise<ProviderCheck> => {
      const envName = `${conf.id.toUpperCase()}_API_KEY`;
      if (!conf.key) {
        return { id: conf.id, label: conf.label, configured: false, ok: false, message: `还没设定 ${envName}`, models: [] };
      }
      const balance = conf.id === "deepseek" ? await deepseekBalance(conf) : null;
      const models: ModelCheck[] = [];
      let fatal: Failure | null = null;
      for (const model of conf.models) {
        if (fatal) {
          models.push({ model, ok: false, text: failureText(fatal) });
          continue;
        }
        const r = await pingModel(conf, model);
        if (r.ok) models.push({ model, ok: true, text: "能用 ✓" });
        else {
          models.push({ model, ok: false, text: failureText(r.failure) });
          if (r.failure.kind === "key" || r.failure.kind === "balance") fatal = r.failure;
        }
      }
      const ok = models.some((m) => m.ok);
      const message = ok
        ? models.every((m) => m.ok)
          ? "全部能用"
          : "有模型能用；不能用的会自动跳过"
        : fatal?.kind === "key"
          ? `${envName} 无效或没有权限，请检查 Vercel 的环境变数`
          : fatal?.kind === "balance"
            ? "帐号没有余额：到 platform.deepseek.com 充值，或确认这个 key 是在有余额的帐号开的"
            : "全部模型都不能用，看下面每个模型的原因";
      return { id: conf.id, label: conf.label, configured: true, ok, message, models, balance };
    }),
  );
}

function mockChecks(): ProviderCheck[] {
  return [
    {
      id: "gemini",
      label: "Gemini",
      configured: true,
      ok: true,
      message: "有模型能用；不能用的会自动跳过（测试资料）",
      models: [
        { model: "gemini-3.8-flash", ok: false, text: failureText({ kind: "quota", status: 429 }) },
        { model: "gemini-3.5-flash-lite", ok: true, text: "能用 ✓" },
      ],
      balance: null,
    },
    {
      id: "deepseek",
      label: "DeepSeek",
      configured: true,
      ok: false,
      message: "帐号没有余额：到 platform.deepseek.com 充值，或确认这个 key 是在有余额的帐号开的（测试资料）",
      models: [
        { model: "deepseek-flash", ok: false, text: failureText({ kind: "balance", status: 402 }) },
        { model: "deepseek-v4-flash-vision-exp", ok: false, text: failureText({ kind: "balance", status: 402 }) },
      ],
      balance: { available: false, text: "CNY 0.00（充值 0.00，赠送 0.00）" },
    },
  ];
}

/** 主入口：有设 key 的 AI 同时读，再互相比对 */
export async function readReceipt(imageDataUrl: string): Promise<ReceiptDraft> {
  const mock = process.env.OCR_MOCK;
  let outcomes: ProviderOutcome[];
  if (mock) {
    outcomes = mockOutcomes(mock);
  } else {
    const enabled = providers().filter((p) => p.key);
    if (enabled.length === 0) {
      throw new OcrUnavailableError("还没设定 GEMINI_API_KEY 或 DEEPSEEK_API_KEY，先用手动输入");
    }
    outcomes = await Promise.all(
      enabled.map(async (p): Promise<ProviderOutcome> => {
        try {
          return { provider: p.id, label: p.label, ok: true, result: await readWith(p, imageDataUrl) };
        } catch (e) {
          const msg = e instanceof ProviderError ? e.message : "出错了";
          if (!(e instanceof ProviderError)) console.error(`OCR ${p.id}`, e);
          return { provider: p.id, label: p.label, ok: false, error: msg };
        }
      }),
    );
    // 读到但完全是空的（不是 receipt / 太模糊），当作失败
    outcomes = outcomes.map((o) =>
      o.ok && o.result && o.result.items.length === 0 && o.result.totalCents <= 0
        ? { ...o, ok: false, error: o.result.notes ?? "读不到内容" }
        : o,
    );
  }

  const picked = crossCheck(outcomes, PROVIDER_ORDER);
  if (!picked) {
    const why = outcomes.map((o) => `${o.label}：${o.error ?? "失败"}`).join("。");
    const who = outcomes.length === 2 ? "两个 AI 都" : outcomes.length > 2 ? "几个 AI 都" : "";
    throw new Error(`${who}读不到这张 receipt。${why}`);
  }
  const r = picked.chosen;
  return {
    merchant: r.merchant,
    date: r.date,
    items: r.items,
    charges: r.charges,
    printedSubtotalCents: r.printedSubtotalCents,
    totalCents: r.totalCents,
    notes: r.notes,
    warnings: checkDraft(r.items, r.charges, r.printedSubtotalCents, r.totalCents),
    crossCheck: picked.check,
    raw: { outcomes },
  };
}

// ---------- 没有 key 时测试流程用的假资料 ----------

const GOOD: Omit<ReadResult, "provider" | "label" | "model"> = {
  merchant: "Restoran Sri Melayu",
  date: null,
  items: [
    { name: "Nasi Lemak Ayam Goreng", qty: 1, lineCents: 1290 },
    { name: "Mee Goreng Mamak", qty: 1, lineCents: 950 },
    { name: "Roti Canai", qty: 2, lineCents: 360 },
    { name: "Teh Ais", qty: 3, lineCents: 1050 },
    { name: "Milo Dinosaur", qty: 1, lineCents: 690 },
    { name: "Sotong Goreng Tepung", qty: 1, lineCents: 1800 },
  ],
  charges: [
    { label: "Service Charge 10%", amountCents: 614 },
    { label: "SST 6%", amountCents: 405 },
    { label: "Rounding", amountCents: 1 },
  ],
  printedSubtotalCents: 6140,
  totalCents: 7160,
  notes: null,
};

/**
 * OCR_MOCK=1（或 disagree）：DeepSeek 读错一个、漏一个；agree：两个一样；
 * single：DeepSeek 失败；extra：DeepSeek 多读到一个 item
 */
function mockOutcomes(mode: string): ProviderOutcome[] {
  const gemini: ReadResult = { ...GOOD, provider: "gemini", label: "Gemini", model: "mock" };
  if (mode === "extra") {
    return [
      { provider: "gemini", label: "Gemini", ok: true, result: gemini },
      {
        provider: "deepseek",
        label: "DeepSeek",
        ok: true,
        result: {
          ...gemini,
          provider: "deepseek",
          label: "DeepSeek",
          items: [...GOOD.items, { name: "Telur Mata", qty: 1, lineCents: 150 }],
        },
      },
    ];
  }
  if (mode === "agree") {
    return [
      { provider: "gemini", label: "Gemini", ok: true, result: gemini },
      { provider: "deepseek", label: "DeepSeek", ok: true, result: { ...gemini, provider: "deepseek", label: "DeepSeek" } },
    ];
  }
  if (mode === "single") {
    return [
      { provider: "gemini", label: "Gemini", ok: true, result: gemini },
      { provider: "deepseek", label: "DeepSeek", ok: false, error: "太久没回应" },
    ];
  }
  const deepseek: ReadResult = {
    ...GOOD,
    provider: "deepseek",
    label: "DeepSeek",
    model: "mock",
    items: [
      { name: "NASI LEMAK AYAM GRG", qty: 1, lineCents: 1290 },
      { name: "Mee Goreng Mamak", qty: 1, lineCents: 950 },
      { name: "Teh Ais", qty: 3, lineCents: 1050 },
      { name: "Milo Dinosaur", qty: 1, lineCents: 650 },
      { name: "SOTONG GRG TEPUNG", qty: 1, lineCents: 1800 },
    ],
    charges: GOOD.charges.slice(0, 2),
  };
  return [
    { provider: "gemini", label: "Gemini", ok: true, result: gemini },
    { provider: "deepseek", label: "DeepSeek", ok: true, result: deepseek },
  ];
}
