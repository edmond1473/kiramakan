import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkProviders, readReceipt } from "../server/ocr";

const GOOD = JSON.stringify({
  merchant: "Kedai Kopi",
  date: "2026-10-07",
  items: [{ name: "Nasi Lemak", qty: 1, line_total: 10 }],
  charges: [{ label: "SST", amount: 0.6 }],
  subtotal: 10,
  total: 10.6,
  notes: "",
});
const IMAGE = "data:image/jpeg;base64,AAAA";

type Call = { url: string; model?: string; format?: string };
type Handler = (c: Call) => Response;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const ok = (content: string) => json(200, { choices: [{ message: { content } }] });
const err = (status: number, message: string) => json(status, { error: { message } });

let calls: Call[] = [];
function mockFetch(handler: Handler) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const c: Call = { url, model: body.model, format: body.response_format?.type ?? (body.model ? "none" : undefined) };
      calls.push(c);
      return handler(c);
    }),
  );
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  delete process.env.OCR_MOCK;
  delete process.env.GEMINI_MODEL;
  delete process.env.DEEPSEEK_MODEL;
  delete process.env.OPENAI_API_KEY;
  process.env.GEMINI_API_KEY = "g-key";
  process.env.DEEPSEEK_API_KEY = "d-key";
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("readReceipt：模型失败时自动换", () => {
  it("3.8 Flash 次数用完 → 换 3.5 Flash-Lite；DeepSeek 没余额就只用 Gemini 的结果", async () => {
    mockFetch(({ url, model }) => {
      if (url.includes("deepseek")) return err(402, "Insufficient Balance");
      if (model === "gemini-3.8-flash") return err(429, "You exceeded your current quota");
      return ok(GOOD);
    });
    const r = await readReceipt(IMAGE);
    expect(r.totalCents).toBe(1060);
    expect(r.crossCheck.status).toBe("single");
    expect(r.raw.outcomes.find((o) => o.provider === "deepseek")?.error).toBe("帐号没有余额");
    expect(r.raw.outcomes.find((o) => o.provider === "gemini")?.result?.model).toBe("gemini-3.5-flash-lite");
    // DeepSeek 402 后不再浪费请求
    expect(calls.filter((c) => c.url.includes("deepseek"))).toHaveLength(1);
  });

  it("全部失败：每个模型写出真正的原因（不再只显示最后一个）", async () => {
    mockFetch(({ url, model }) => {
      if (url.includes("deepseek")) return err(402, "Insufficient Balance");
      if (model === "gemini-3.8-flash") return err(429, "quota");
      return json(404, [{ error: { code: 404, message: `models/${model} is not found` } }]);
    });
    await expect(readReceipt(IMAGE)).rejects.toThrow(
      "两个 AI 都读不到这张 receipt。Gemini：gemini-3.8-flash 次数到上限了（可能是今天的免费次数用完），gemini-3.5-flash-lite 这个模型不能用（可能已停用）。DeepSeek：帐号没有余额",
    );
  });

  it("不支持 json_schema 就换 json_object", async () => {
    mockFetch(({ url, format }) => {
      if (url.includes("deepseek")) return ok(GOOD);
      if (format === "json_schema") return err(400, "Invalid JSON payload: response_format.json_schema is not supported");
      return ok(GOOD);
    });
    const r = await readReceipt(IMAGE);
    expect(r.crossCheck.status).toBe("match");
    const gem = calls.filter((c) => c.url.includes("generativelanguage"));
    expect(gem.map((c) => `${c.model}/${c.format}`)).toEqual(["gemini-3.8-flash/json_schema", "gemini-3.8-flash/json_object"]);
  });

  it("key 错就直接停，不再试别的模型", async () => {
    mockFetch(({ url }) => {
      if (url.includes("deepseek")) return ok(GOOD);
      return json(400, [{ error: { message: "API key not valid. Please pass a valid API key." } }]);
    });
    const r = await readReceipt(IMAGE);
    expect(r.raw.outcomes.find((o) => o.provider === "gemini")?.error).toBe("API key 无效或没有权限");
    expect(calls.filter((c) => c.url.includes("generativelanguage"))).toHaveLength(1);
  });

  it("太久没回应", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
      }),
    );
    await expect(readReceipt(IMAGE)).rejects.toThrow("Gemini：太久没回应。DeepSeek：太久没回应");
  });
});

describe("checkProviders（设定页的检查 AI）", () => {
  it("显示每个模型能不能用和 DeepSeek 余额", async () => {
    mockFetch(({ url, model }) => {
      if (url.endsWith("/user/balance")) {
        return json(200, {
          is_available: false,
          balance_infos: [{ currency: "CNY", total_balance: "0.00", granted_balance: "0.00", topped_up_balance: "0.00" }],
        });
      }
      if (url.includes("deepseek")) return err(402, "Insufficient Balance");
      if (model === "gemini-3.8-flash") return err(429, "quota");
      return ok("OK");
    });
    const [gemini, deepseek] = await checkProviders();
    expect(gemini.ok).toBe(true);
    expect(gemini.models).toEqual([
      { model: "gemini-3.8-flash", ok: false, text: "次数到上限了（可能是今天的免费次数用完）" },
      { model: "gemini-3.5-flash-lite", ok: true, text: "能用 ✓" },
    ]);
    expect(deepseek.ok).toBe(false);
    expect(deepseek.balance).toEqual({ available: false, text: "CNY 0.00（充值 0.00，赠送 0.00）" });
    expect(deepseek.message).toContain("帐号没有余额");
    // 余额不够：第二个模型不用再试
    expect(calls.filter((c) => c.url.endsWith("/chat/completions") && c.url.includes("deepseek"))).toHaveLength(1);
  });

  it("没设 key 的显示「还没设定」", async () => {
    delete process.env.DEEPSEEK_API_KEY;
    mockFetch(() => ok("OK"));
    const [, deepseek] = await checkProviders();
    expect(deepseek).toMatchObject({ configured: false, message: "还没设定 DEEPSEEK_API_KEY" });
  });
});
