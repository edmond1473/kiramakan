// 读 TNG 进账通知：金额、谁转的、是收钱还是付钱；再把名字对上朋友。
// 不知道 TNG 每个版本 / 语言的通知长怎样，所以规则写得宽一点；认不出的就交给人确认。

/** in 收到钱 · out 自己付钱 · other 不是转账（cashback、reload、广告） · unknown 看不出来 */
export type Direction = "in" | "out" | "other" | "unknown";

export interface ParsedNotice {
  text: string;
  amountCents: number | null;
  sender: string | null;
  direction: Direction;
}

/** iPhone 捷径传来的内容可能是 JSON、纯文字或表单：全部摊平成一段文字 */
export function noticeText(input: unknown): string {
  const parts: string[] = [];
  const walk = (v: unknown, depth: number) => {
    if (depth > 4 || v == null) return;
    if (typeof v === "string") {
      if (v.trim()) parts.push(v.trim());
    } else if (typeof v === "number") {
      parts.push(String(v));
    } else if (Array.isArray(v)) {
      for (const x of v) walk(x, depth + 1);
    } else if (typeof v === "object") {
      for (const x of Object.values(v as Record<string, unknown>)) walk(x, depth + 1);
    }
  };
  walk(input, 0);
  // 去掉重复的段落（有些捷径会把标题和内容都传两次）
  return [...new Set(parts)].join("\n").slice(0, 2000);
}

const AMOUNT = /(?:RM|MYR)\s?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)/gi;
/** 金额前面有这些字的是余额，不是转进来的钱 */
const BALANCE_BEFORE = /(balance|baki|余额|餘額|limit)[^\n]{0,20}$/i;

const IN_WORDS =
  /(receiv|you(?:'ve| have)? got|credited|money in|sent you|transferred (?:\S+ )*to you|paid you|menerima|diterima|terima wang|daripada|收到|收款|入账|到账|转给你|转入)/i;
const OUT_WORDS =
  /(you(?:'ve| have)? (?:successfully )?(?:paid|sent|transferred)|payment (?:to|successful|of)|paid to|sent to|anda telah membayar|anda telah memindahkan|bayaran kepada|pembayaran kepada|pembayaran berjaya|已付款|付款成功|支付成功|你已转|您已转|转账给|付给)/i;
/** 朋友转账才会有的字 */
const P2P_WORDS = /(transfer|duitnow|sent you|has sent|paid you|pindahan|terima wang|转账|轉帳|汇款)/i;
/** 不是朋友转账：cashback、reload、积分、广告 */
const NON_TRANSFER =
  /\b(?:cash ?back|rebates?|rewards?|vouchers?|promo(?:tion)?s?|reload|top[- ]?up|gopoints|points?|earn(?:ed|ings?)?|interest|insurance|toll|parking|rfid|paydirect|refund(?:ed)?|discount|off|deals?|offers?|giveaway|tambah nilai|ganjaran|bayaran balik)\b|go\+|stand a chance|返现|返現|充值|奖励|獎勵|优惠|優惠|积分|積分|退款/i;

const NAME_STOP = String.raw`(?=\s+(?:via|on|at|for|with|ref(?:erence)?|to\s+your|into|melalui|pada)\b|\s+(?:RM|MYR)\s?\d|[.,;:!?()[\]\n]|$)`;

const NAME_PATTERNS: RegExp[] = [
  // You've received RM10.00 from ALI BIN ABU (via DuitNow).
  new RegExp(String.raw`\bfrom\s+(.+?)${NAME_STOP}`, "i"),
  // Anda telah menerima RM10.00 daripada ALI BIN ABU
  new RegExp(String.raw`\bdaripada\s+(.+?)${NAME_STOP}`, "i"),
  // RM10.00 has been transferred to your eWallet by ALI BIN ABU
  new RegExp(String.raw`(?:transferred|sent|paid|credited)\b[^.\n]*?\bby\s+(.+?)${NAME_STOP}`, "i"),
  // 您收到来自 ALI BIN ABU 的 RM10.00
  /(?:来自|來自|从|從)\s*(.+?)(?=\s*(?:的|转|轉|汇|匯|通过|透过|，|,|。|\.|!|！|\n|$))/,
  // 收到 ALI BIN ABU 转账 RM10.00
  /收到\s*([^\s\d，,。.:：]+(?:\s+[^\s\d，,。.:：]+)*)\s*(?:的)?(?:转账|轉帳|转来|轉來|汇款|匯款)/,
  // ALI BIN ABU has transferred RM10.00 to you / ALI sent you RM10
  /(?:^|[.!?:]\s+|\n)([A-Za-z][A-Za-z .'@\-*/]{0,60}?)\s+(?:has\s+)?(?:sent|transferred|paid)\b(?=(?:[^.!?\n]|\.\d)*\byou\b)/i,
];

function cleanName(raw: string): string | null {
  let s = raw.replace(/["“”'‘’]/g, "").replace(/\s+/g, " ").trim();
  s = s.replace(/^(?:mr|mrs|ms|miss|encik|cik|puan)\.?\s+/i, "");
  s = s.replace(/[\s:：\-–—]+$/g, "").trim();
  if (!s || s.length > 60) return null;
  if (/^(you|anda|your|my|the|a|an|tng|tng ewallet|ewallet)$/i.test(s)) return null;
  if (/^(your|my|the)\b/i.test(s)) return null; // from your eWallet / from the merchant
  if (/\b(?:RM|MYR)\s?\d/i.test(s) || /^\d[\d\s.,]*$/.test(s)) return null;
  return s;
}

function pickAmount(t: string): number | null {
  const all = [...t.matchAll(AMOUNT)];
  if (all.length === 0) return null;
  const notBalance = all.find((m) => !BALANCE_BEFORE.test(t.slice(Math.max(0, (m.index ?? 0) - 30), m.index)));
  const m = notBalance ?? all[0];
  const cents = Math.round(Number(m[1].replace(/,/g, "")) * 100);
  return cents > 0 ? cents : null;
}

export function parseTngNotice(text: string): ParsedNotice {
  const t = text.replace(/\r/g, "").trim();
  const amountCents = pickAmount(t);

  let sender: string | null = null;
  for (const re of NAME_PATTERNS) {
    const n = re.exec(t);
    if (n?.[1]) {
      sender = cleanName(n[1]);
      if (sender) break;
    }
  }
  // 「from GO+ earnings」「from Shopee refund」这种不是人
  if (sender && NON_TRANSFER.test(sender)) sender = null;

  // 两种字都有的话，看哪一种先出现（「You have paid RM10 to X. You received 10 points」是付钱）
  const iIn = t.search(IN_WORDS);
  const iOut = t.search(OUT_WORDS);
  let direction: Direction = iIn >= 0 && (iOut < 0 || iIn <= iOut) ? "in" : iOut >= 0 ? "out" : "unknown";
  // 没有转账的人、又像 cashback / reload / 广告：不是朋友转的
  if (direction !== "out" && !sender && NON_TRANSFER.test(t) && !P2P_WORDS.test(t)) direction = "other";

  return { text: t, amountCents, sender, direction };
}

/** 名字统一成大写、单一空格；保留中文和打码的 * */
export function normalizeName(s: string): string {
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9*㐀-鿿]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface MatchCandidate {
  personId: string;
  /** TNG 名字和以前确认过的名字（最准） */
  tngNames: string[];
  /** app 里的名字（例如 Ali），只拿来比开头 */
  displayName: string;
  /** 现在还欠收款人钱：分数一样时优先 */
  owes: boolean;
}

export interface MatchResult {
  personId: string | null;
  score: number;
  /** 分数一样高、没办法决定的人 */
  tied: string[];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** a 的每个字都按顺序出现在 b 里 */
function inOrder(a: string[], b: string[]): boolean {
  let j = 0;
  for (const x of a) {
    while (j < b.length && b[j] !== x) j++;
    if (j >= b.length) return false;
    j++;
  }
  return true;
}

function tngScore(sender: string, cand: string): number {
  if (!sender || !cand) return 0;
  if (sender === cand) return 100;
  if (sender.includes("*")) {
    // 打码的名字（ALI B** A**）：看得到的字至少要 4 个，不然太多人对得上
    const visible = sender.replace(/[*\s]/g, "").length;
    if (visible >= 4) {
      const re = new RegExp(`^${sender.split(/\*+/).map((p) => escapeRe(p.trim())).join(".*")}$`);
      if (re.test(cand)) return 90;
    }
  }
  const s = sender.replace(/\*/g, " ").replace(/\s+/g, " ").trim();
  const st = s.split(" ").filter(Boolean);
  const ct = cand.split(" ").filter(Boolean);
  const [short, long] = st.length <= ct.length ? [st, ct] : [ct, st];
  // 少了中间名、或多了 BIN / A/L 之类：短的名字每个字按顺序都在长的里面
  if (short.length >= 2 && short.join("").length >= 5 && inOrder(short, long)) return 80;
  if (s.length >= 6 && (cand.startsWith(`${s} `) || s.startsWith(`${cand} `))) return 75;
  return 0;
}

function displayScore(sender: string, display: string): number {
  if (display.length < 3) return 0;
  const s = sender.replace(/\*/g, "").replace(/\s+/g, " ").trim();
  if (s === display) return 85;
  if (s.startsWith(`${display} `)) return 65; // 「ALI」对「ALI BIN ABU」
  return 0;
}

/** 名字对上哪个朋友：最高分要 ≥ 70 而且只有一个人 */
export function matchSender(sender: string | null, candidates: MatchCandidate[]): MatchResult {
  if (!sender) return { personId: null, score: 0, tied: [] };
  const s = normalizeName(sender);
  if (!s) return { personId: null, score: 0, tied: [] };
  const scored = candidates
    .map((c) => {
      const t = Math.max(0, ...c.tngNames.map((n) => tngScore(s, normalizeName(n))));
      const d = displayScore(s, normalizeName(c.displayName));
      const base = Math.max(t, d);
      return { id: c.personId, score: base > 0 && c.owes ? base + 5 : base };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return { personId: null, score: 0, tied: [] };
  const top = scored[0].score;
  const tied = scored.filter((x) => x.score === top).map((x) => x.id);
  if (top < 70 || tied.length > 1) return { personId: null, score: top, tied };
  return { personId: scored[0].id, score: top, tied: [] };
}
