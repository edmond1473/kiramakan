import { describe, expect, it } from "vitest";
import { apiErrorMessage, classifyHttp, failureText, summarizeAttempts } from "../ai-errors";

describe("apiErrorMessage", () => {
  it("读 OpenAI 格式和 Gemini 的 array 格式", () => {
    expect(apiErrorMessage('{"error":{"message":"Insufficient Balance","type":"x"}}')).toBe("Insufficient Balance");
    expect(apiErrorMessage('[{"error":{"code":404,"message":"models/gemini-2.5-flash is not found"}}]')).toBe(
      "models/gemini-2.5-flash is not found",
    );
    expect(apiErrorMessage("upstream timeout")).toBe("upstream timeout");
    expect(apiErrorMessage("")).toBeNull();
  });
});

describe("classifyHttp", () => {
  it("先看状态码", () => {
    // 429 的讯息里就算有 api_key 字眼，也是次数问题
    expect(classifyHttp(429, '{"error":{"message":"Quota exceeded for consumer api_key:xxx"}}').kind).toBe("quota");
    expect(classifyHttp(402, '{"error":{"message":"Insufficient Balance"}}').kind).toBe("balance");
    expect(classifyHttp(404, '[{"error":{"message":"models/gemini-2.5-flash is not found"}}]').kind).toBe("missing");
    expect(classifyHttp(403, "{}").kind).toBe("key");
    expect(classifyHttp(403, "Host not in allowlist: api.deepseek.com").kind).toBe("network");
    expect(classifyHttp(503, "{}").kind).toBe("server");
  });
  it("400 再看内容", () => {
    expect(classifyHttp(400, '[{"error":{"message":"API key not valid. Please pass a valid API key."}}]').kind).toBe("key");
    expect(classifyHttp(400, '{"error":{"message":"Invalid value for response_format.json_schema"}}').kind).toBe("format");
    expect(classifyHttp(400, '{"error":{"message":"Model Not Exist"}}').kind).toBe("missing");
    const r = classifyHttp(400, '[{"error":{"message":"User location is not supported for the API use."}}]');
    expect(r.kind).toBe("rejected");
    expect(failureText(r)).toContain("User location is not supported");
  });
});

describe("summarizeAttempts", () => {
  it("每个模型写出最后一个真正的原因", () => {
    const text = summarizeAttempts([
      { model: "gemini-3.8-flash", kind: "format", status: 400 },
      { model: "gemini-3.8-flash", kind: "quota", status: 429 },
      { model: "gemini-3.5-flash-lite", kind: "missing", status: 404 },
    ]);
    expect(text).toBe("gemini-3.8-flash 次数到上限了（可能是今天的免费次数用完），gemini-3.5-flash-lite 这个模型不能用（可能已停用）");
  });
  it("key 或余额问题直接说", () => {
    expect(summarizeAttempts([{ model: "deepseek-flash", kind: "balance", status: 402 }])).toBe("帐号没有余额");
    expect(summarizeAttempts([])).toBe("没有可用的模型");
  });
});
