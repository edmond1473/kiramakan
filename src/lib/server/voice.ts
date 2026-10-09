import "server-only";
import { z } from "zod";
import { checkDraft } from "../receipt";
import { crossCheck, type ProviderOutcome, type ReadResult } from "../receipt-compare";
import { voiceToBill, type VoiceRaw } from "../voice";
import { OcrUnavailableError, PROVIDER_ORDER, ProviderError, providers, runTask, type AiTask, type ProviderConf, type ReceiptDraft } from "./ocr";

// 用说的（录音）或打字记一餐。录音只有 Gemini 听得懂；打字的话有 key 的 AI 一起读、互相比对。
// AI 只把听到的东西原样抄下来，item 小计、tax、总额都在 voice.ts 用 code 算。

const SYSTEM_PROMPT = `You turn what someone says (or types) about a meal they just paid for in Malaysia into a JSON object, and return ONLY that JSON, no other text. They often mix Chinese, English, Malay and Cantonese in one sentence.

JSON shape:
{"transcript": string, "title": string, "items": [{"name": string, "qty": number, "amount": number, "amount_is_each": boolean}], "charges": [{"label": string, "percent": number, "amount": number}], "has_tax": boolean, "total": number, "notes": string}

How people say amounts (all Malaysian Ringgit):
- 块 / 蚊 / 文 / 元 / ringgit / hengget / RM all mean RM. 毛 / 角 = 0.10. sen / 仙 = 0.01.
- "24块" = "二十四块" = "RM24" = "24 ringgit" = 24. "两块半" = "2块5" = "两块五" = 2.50. "十二块五毛" = 12.50. "five fifty" = 5.50. "lima ringgit lima puluh sen" = 5.50.

Rules:
- transcript: for audio, write down what you heard in the original languages. For typed text, copy it.
- Do NO arithmetic. Copy each number exactly as said; the app does all the maths.
- items: each food or drink. "name" as said (e.g. "Nasi Lemak", "鸡饭", "Teh O Ais"). "qty" = how many (1 if not said). "amount" = the price said for it (0 if no price was said; never guess). "amount_is_each" = true when the price is per piece / per cup / per plate ("每个6块", "6块一个", "RM3 each", "satu RM3"), false when it is the price for the whole line ("两个 nasi lemak 一共 24 块"). If unclear, use false.
- charges: service charge, SST / GST / tax, delivery or packing fees, discounts, rounding. If a percentage is said ("SST 6%", "service charge 10 percent", "加一" which means a 10% service charge), set "percent" to it and "amount" to 0. If an amount is said ("tax 3块"), set "amount" to it and "percent" to 0. "label" short, e.g. "Service Charge 10%", "SST 6%", "Tax", "Discount".
- has_tax: true only if they say there is tax / service charge / 有税 / 有 tax but give neither a percentage nor an amount for it (then do not add it to charges). Otherwise false.
- total: the final amount paid if said ("总共", "一共", "total", "semua", "jumlah", "埋单"), else 0.
- title: the shop or place name if mentioned, else "".
- notes: "" normally; if no prices were said at all or it is not about a meal, explain briefly here.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    transcript: { type: "string" },
    title: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          qty: { type: "number" },
          amount: { type: "number" },
          amount_is_each: { type: "boolean" },
        },
        required: ["name", "qty", "amount", "amount_is_each"],
      },
    },
    charges: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { label: { type: "string" }, percent: { type: "number" }, amount: { type: "number" } },
        required: ["label", "percent", "amount"],
      },
    },
    has_tax: { type: "boolean" },
    total: { type: "number" },
    notes: { type: "string" },
  },
  required: ["transcript", "title", "items", "charges", "has_tax", "total", "notes"],
} as const;

const num = z.preprocess((v) => (typeof v === "string" ? Number(v.replace(/[^0-9.\-]/g, "")) : v), z.number().finite());
const RawSchema = z.object({
  transcript: z.string().nullish(),
  title: z.string().nullish(),
  items: z
    .array(z.object({ name: z.string().nullish(), qty: num.nullish(), amount: num.nullish(), amount_is_each: z.boolean().nullish() }))
    .default([]),
  charges: z.array(z.object({ label: z.string().nullish(), percent: num.nullish(), amount: num.nullish() })).default([]),
  has_tax: z.boolean().nullish(),
  total: num.nullish(),
  notes: z.string().nullish(),
});

function toRaw(r: z.infer<typeof RawSchema>): VoiceRaw {
  return {
    transcript: r.transcript ?? "",
    title: r.title ?? "",
    items: r.items.map((i) => ({ name: i.name ?? "", qty: i.qty ?? 1, amount: i.amount ?? 0, amountIsEach: !!i.amount_is_each })),
    charges: r.charges.map((c) => ({ label: c.label ?? "", percent: c.percent ?? 0, amount: c.amount ?? 0 })),
    hasTax: !!r.has_tax,
    total: r.total ?? 0,
    notes: r.notes ?? "",
  };
}

interface Heard {
  result: ReadResult;
  transcript: string;
}

function heard(conf: ProviderConf, model: string, raw: VoiceRaw): Heard {
  const b = voiceToBill(raw);
  return {
    transcript: raw.transcript.trim(),
    result: {
      provider: conf.id,
      label: conf.label,
      model,
      merchant: b.title,
      date: null,
      items: b.items,
      charges: b.charges,
      printedSubtotalCents: null,
      totalCents: b.totalCents,
      notes: b.notes,
    },
  };
}

export type VoiceInput = { audioWavBase64: string; text?: undefined } | { text: string; audioWavBase64?: undefined };

function voiceTask(conf: ProviderConf, input: VoiceInput): AiTask<Heard> {
  return {
    name: "voice",
    system: SYSTEM_PROMPT,
    user: () =>
      input.audioWavBase64
        ? [
            { type: "text", text: "Here is a voice recording about the meal. Reply with the JSON object only." },
            { type: "input_audio", input_audio: { data: input.audioWavBase64, format: "wav" } },
          ]
        : [{ type: "text", text: `Here is what they typed about the meal:\n"""\n${input.text}\n"""\nReply with the JSON object only.` }],
    schema: SCHEMA,
    parse: (json, model) => heard(conf, model, toRaw(RawSchema.parse(json))),
  };
}

export type VoiceDraft = ReceiptDraft & { transcript: string | null };

/** 主入口：录音给 Gemini 听；打字的话有 key 的 AI 一起读，再互相比对 */
export async function readVoice(input: VoiceInput): Promise<VoiceDraft> {
  const audio = !!input.audioWavBase64;
  const transcripts = new Map<string, string>();
  let outcomes: ProviderOutcome[];
  if (process.env.VOICE_MOCK) {
    outcomes = mockOutcomes(audio, transcripts);
  } else {
    const enabled = providers().filter((p) => p.key && (!audio || p.id === "gemini"));
    if (enabled.length === 0) {
      throw new OcrUnavailableError(audio ? "还没设定 GEMINI_API_KEY，录音没有 AI 可以听，先用打字或手动输入" : "还没设定 GEMINI_API_KEY 或 DEEPSEEK_API_KEY，先用手动输入");
    }
    outcomes = await Promise.all(
      enabled.map(async (p): Promise<ProviderOutcome> => {
        try {
          const h = await runTask(p, voiceTask(p, input));
          transcripts.set(p.id, h.transcript);
          return { provider: p.id, label: p.label, ok: true, result: h.result };
        } catch (e) {
          const msg = e instanceof ProviderError ? e.message : "出错了";
          if (!(e instanceof ProviderError)) console.error(`voice ${p.id}`, e);
          return { provider: p.id, label: p.label, ok: false, error: msg };
        }
      }),
    );
    // 一个价钱都没听到，当作失败
    outcomes = outcomes.map((o) =>
      o.ok && o.result && o.result.items.length === 0 && o.result.totalCents <= 0
        ? { ...o, ok: false, error: o.result.notes ?? "没听到价钱" }
        : o,
    );
  }

  const picked = crossCheck(outcomes, PROVIDER_ORDER);
  if (!picked) {
    const why = outcomes.map((o) => `${o.label}：${o.error ?? "失败"}`).join("。");
    throw new Error(`${audio ? "听不懂这段录音" : "看不懂这段文字"}。${why}`);
  }
  const r = picked.chosen;
  // 比对的提示是给 receipt 写的；这里没有 receipt，要对的是自己讲的 / 打的
  const check = audio
    ? { ...picked.check, message: "录音只有 Gemini 听得懂，没有另一个 AI 可以对照。对一下上面「AI 听到的」跟下面的 item 一不一样。" }
    : { ...picked.check, message: picked.check.message.replaceAll("receipt", "你打的字") };
  return {
    merchant: r.merchant,
    date: null,
    items: r.items,
    charges: r.charges,
    printedSubtotalCents: null,
    totalCents: r.totalCents,
    notes: r.notes,
    warnings: checkDraft(r.items, r.charges, null, r.totalCents),
    crossCheck: check,
    raw: { outcomes },
    transcript: transcripts.get(r.provider) || null,
  };
}

// ---------- 没有 key 时测试流程用的假资料（VOICE_MOCK=1） ----------

function mockOutcomes(audio: boolean, transcripts: Map<string, string>): ProviderOutcome[] {
  const raw: VoiceRaw = {
    transcript: "总共 66 块半，nasi lemak 两个 24 块，teh tarik 三杯每杯 3 块，ayam goreng 一个 18 块，roti canai 四片一共 6 块，加一，SST 6%",
    title: "",
    items: [
      { name: "Nasi Lemak", qty: 2, amount: 24, amountIsEach: false },
      { name: "Teh Tarik", qty: 3, amount: 3, amountIsEach: true },
      { name: "Ayam Goreng", qty: 1, amount: 18, amountIsEach: false },
      { name: "Roti Canai", qty: 4, amount: 6, amountIsEach: false },
    ],
    charges: [
      { label: "Service Charge 10%", percent: 10, amount: 0 },
      { label: "SST 6%", percent: 6, amount: 0 },
    ],
    hasTax: false,
    total: 66.5,
    notes: "",
  };
  const gemini: ProviderConf = { id: "gemini", label: "Gemini", url: "", key: "mock", models: ["mock"], formats: ["none"] };
  const deepseek: ProviderConf = { ...gemini, id: "deepseek", label: "DeepSeek" };
  const g = heard(gemini, "mock", raw);
  transcripts.set("gemini", g.transcript);
  if (audio) return [{ provider: "gemini", label: "Gemini", ok: true, result: g.result }];
  const d = heard(deepseek, "mock", raw);
  transcripts.set("deepseek", d.transcript);
  return [
    { provider: "gemini", label: "Gemini", ok: true, result: g.result },
    { provider: "deepseek", label: "DeepSeek", ok: true, result: d.result },
  ];
}
