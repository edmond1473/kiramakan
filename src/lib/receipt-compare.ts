// 两个（或以上）AI 读同一张 receipt 的结果互相比对。纯函数，前后端都能用、可以单元测试。
import { formatRM } from "./money";

export type ProviderId = "gemini" | "deepseek" | "openai";

export interface ReadItem {
  name: string;
  qty: number;
  lineCents: number;
}

export interface ReadResult {
  provider: ProviderId;
  label: string;
  model: string;
  merchant: string | null;
  date: string | null;
  items: ReadItem[];
  charges: { label: string; amountCents: number }[];
  printedSubtotalCents: number | null;
  totalCents: number;
  notes: string | null;
}

export interface ProviderOutcome {
  provider: ProviderId;
  label: string;
  ok: boolean;
  error?: string;
  result?: ReadResult;
}

export type CrossStatus = "match" | "picked" | "unsure" | "single";

export interface ProviderSummary {
  provider: ProviderId;
  label: string;
  ok: boolean;
  error?: string;
  model?: string;
  totalCents?: number;
  itemCount?: number;
  balanced?: boolean;
}

export interface CrossCheck {
  status: CrossStatus;
  chosen: ProviderId;
  chosenLabel: string;
  message: string;
  providers: ProviderSummary[];
  /** 总额读得不一样时，每个 AI 读到的总额 */
  totals: { label: string; totalCents: number }[] | null;
  /** 跟 chosen.items 一一对应：这个 item 另一个 AI 读到的不一样（null = 一样） */
  itemNotes: (string | null)[];
  /** 只有另一个 AI 读到的 item（可能是漏掉的） */
  extraItems: (ReadItem & { from: string })[];
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

/** item + charges − 总额（0 才对得上） */
export function balanceDiff(r: Pick<ReadResult, "items" | "charges" | "totalCents">): number {
  return sum(r.items.map((i) => i.lineCents)) + sum(r.charges.map((c) => c.amountCents)) - r.totalCents;
}

/** 这份结果本身算不算得通：item + charges 刚好等于总额，有印小计的话 item 加起来也要等于小计 */
export function isBalanced(r: ReadResult): boolean {
  if (r.totalCents <= 0 || r.items.length === 0) return false;
  if (Math.abs(balanceDiff(r)) > 1) return false;
  if (r.printedSubtotalCents != null && Math.abs(sum(r.items.map((i) => i.lineCents)) - r.printedSubtotalCents) > 1) {
    return false;
  }
  return true;
}

function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function bigrams(s: string): string[] {
  const t = s.replace(/\s+/g, "");
  const out: string[] = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out;
}

/** 名字像不像（OCR 常有大小写、缩写、少字的差别） */
export function similarName(a: string, b: string): boolean {
  const x = normName(a);
  const y = normName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const cx = x.replace(/\s+/g, "");
  const cy = y.replace(/\s+/g, "");
  if (cx.length >= 3 && cy.length >= 3 && (cx.includes(cy) || cy.includes(cx))) return true;
  const A = bigrams(x);
  const B = bigrams(y);
  if (A.length === 0 || B.length === 0) return false;
  const pool = [...B];
  let hit = 0;
  for (const g of A) {
    const k = pool.indexOf(g);
    if (k >= 0) {
      hit++;
      pool.splice(k, 1);
    }
  }
  return (2 * hit) / (A.length + B.length) >= 0.5;
}

function sameItems(a: ReadItem[], b: ReadItem[]): boolean {
  if (a.length !== b.length) return false;
  const x = a.map((i) => i.lineCents).sort((p, q) => p - q);
  const y = b.map((i) => i.lineCents).sort((p, q) => p - q);
  return x.every((v, i) => v === y[i]);
}

/** 把 chosen 的 item 跟 other 的 item 对齐，找出读得不一样 / 只有一边有的 */
export function alignItems(
  chosen: ReadItem[],
  other: ReadItem[],
  chosenLabel: string,
  otherLabel: string,
): { notes: (string | null)[]; extra: ReadItem[] } {
  const usedOther = new Set<number>();
  const matched: (number | null)[] = chosen.map(() => null);
  const notes: (string | null)[] = chosen.map(() => null);

  // 第 1 轮：金额一样、名字也像
  chosen.forEach((ci, i) => {
    const j = other.findIndex((oi, k) => !usedOther.has(k) && oi.lineCents === ci.lineCents && similarName(oi.name, ci.name));
    if (j >= 0) {
      usedOther.add(j);
      matched[i] = j;
    }
  });
  // 第 2 轮：名字像、金额不一样 → 读成不同金额
  chosen.forEach((ci, i) => {
    if (matched[i] != null) return;
    const j = other.findIndex((oi, k) => !usedOther.has(k) && similarName(oi.name, ci.name));
    if (j >= 0) {
      usedOther.add(j);
      matched[i] = j;
      const oi = other[j];
      const qty = oi.qty !== ci.qty ? `（×${oi.qty}）` : "";
      notes[i] = `${otherLabel} 读成 ${formatRM(oi.lineCents)}${qty}`;
    }
  });
  // 第 3 轮：金额一样但名字差很多（多数是名字读法不同），当作同一个
  chosen.forEach((ci, i) => {
    if (matched[i] != null) return;
    const j = other.findIndex((oi, k) => !usedOther.has(k) && oi.lineCents === ci.lineCents);
    if (j >= 0) {
      usedOther.add(j);
      matched[i] = j;
    }
  });
  chosen.forEach((_, i) => {
    if (matched[i] == null) notes[i] = `只有 ${chosenLabel} 读到这个`;
  });
  const extra = other.filter((_, k) => !usedOther.has(k));
  return { notes, extra };
}

/**
 * 决定用哪个 AI 的结果，并列出差异。
 * order：两个都算得通时，优先用排前面的。
 */
export function crossCheck(outcomes: ProviderOutcome[], order: ProviderId[]): { chosen: ReadResult; check: CrossCheck } | null {
  const rank = (p: ProviderId) => {
    const i = order.indexOf(p);
    return i < 0 ? 99 : i;
  };
  const ok = outcomes
    .filter((o) => o.ok && o.result)
    .map((o) => o.result as ReadResult)
    .sort((a, b) => rank(a.provider) - rank(b.provider));
  if (ok.length === 0) return null;

  const providers: ProviderSummary[] = outcomes.map((o) => ({
    provider: o.provider,
    label: o.label,
    ok: o.ok,
    error: o.error,
    model: o.result?.model,
    totalCents: o.result?.totalCents,
    itemCount: o.result?.items.length,
    balanced: o.result ? isBalanced(o.result) : undefined,
  }));
  const failed = outcomes.filter((o) => !o.ok);

  if (ok.length === 1) {
    const r = ok[0];
    const why = failed.map((f) => `${f.label}${f.error ? `：${f.error}` : " 没有回应"}`).join("；");
    return {
      chosen: r,
      check: {
        status: "single",
        chosen: r.provider,
        chosenLabel: r.label,
        message: `只有 ${r.label} 读到${why ? `（${why}）` : ""}，没有另一个 AI 可以对照，请自己看一下。`,
        providers,
        totals: null,
        itemNotes: r.items.map(() => null),
        extraItems: [],
      },
    };
  }

  const balanced = ok.filter(isBalanced);
  const first = ok[0];
  const allSame = ok.every((r) => r.totalCents === first.totalCents && sameItems(r.items, first.items));

  let chosen: ReadResult;
  let status: CrossStatus;
  if (allSame) {
    chosen = balanced[0] ?? first;
    status = "match";
  } else if (balanced.length === 1) {
    chosen = balanced[0];
    status = "picked";
  } else if (balanced.length > 1) {
    chosen = balanced[0];
    status = "unsure";
  } else {
    chosen = [...ok].sort((a, b) => Math.abs(balanceDiff(a)) - Math.abs(balanceDiff(b)) || rank(a.provider) - rank(b.provider))[0];
    status = "unsure";
  }

  const others = ok.filter((r) => r !== chosen);
  const other = others[0];
  const { notes, extra } = alignItems(chosen.items, other.items, chosen.label, other.label);
  const totalsDiffer = ok.some((r) => r.totalCents !== chosen.totalCents);
  const names = ok.map((r) => r.label).join(" 和 ");

  let message: string;
  if (status === "match") {
    message = isBalanced(chosen)
      ? `${names} 读的一样，item 加起来也对得上总额 ✓`
      : `${names} 读的一样，但加起来对不上总额，请对一下 receipt。`;
  } else if (status === "picked") {
    message = `${names} 读的不一样。${chosen.label} 读的加起来刚好等于总额，所以用了它的；标出来的地方请对一下 receipt。`;
  } else if (balanced.length > 1) {
    message = `${names} 读的不一样，两边加起来都对得上总额，先用了 ${chosen.label} 的。请对着 receipt 看标出来的地方。`;
  } else {
    message = `${names} 读的不一样，而且加起来都对不上总额。先用了比较接近的 ${chosen.label}，请对着 receipt 改。`;
  }

  return {
    chosen,
    check: {
      status,
      chosen: chosen.provider,
      chosenLabel: chosen.label,
      message,
      providers,
      totals: totalsDiffer ? ok.map((r) => ({ label: r.label, totalCents: r.totalCents })) : null,
      itemNotes: status === "match" ? chosen.items.map(() => null) : notes,
      extraItems: status === "match" ? [] : extra.map((e) => ({ ...e, from: other.label })),
    },
  };
}
