// TNG「Transaction History」PDF（TNG app 导出、寄到 email 的那份）：按每个字的位置把表格拆回来，挑出别人转给你的钱。
// 纯函数：输入是每一页的字和位置（server 用 unpdf 读 PDF），可以单元测试。
import { normalizeName } from "./tng-notify";

/** PDF 上的一段字；y 越大越上面 */
export interface PdfText {
  str: string;
  x: number;
  y: number;
}

export interface StatementRow {
  /** YYYY-MM-DD（PDF 只有日期，没有时间） */
  date: string;
  status: string;
  type: string;
  /** 交易编号：每一笔都不一样，拿来防重复 */
  reference: string;
  /** 对方：转账的话是对方在 TNG / 银行登记的名字 */
  description: string;
  details: string;
  amountCents: number | null;
  balanceCents: number | null;
}

export interface Statement {
  registeredName: string | null;
  period: string | null;
  rows: StatementRow[];
}

const COLS = ["Date", "Status", "Transaction Type", "Reference", "Description", "Details", "Amount (RM)", "Wallet Balance"] as const;
type Col = (typeof COLS)[number];
const DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

export function parseStatement(pages: PdfText[][]): Statement {
  let xs: number[] | null = null;
  let registeredName: string | null = null;
  let period: string | null = null;
  /** 现在在哪一个区块：「TNG WALLET TRANSACTION」或「GO+ TRANSACTION」 */
  let section: string | null = null;
  const rows: StatementRow[] = [];

  for (const raw of pages) {
    const items = raw.map((i) => ({ ...i, str: i.str.trim() })).filter((i) => i.str);
    // 第 1 页上面的帐户资料：左边是标签，同一行右边是值
    const valueOf = (label: string) => {
      const l = items.find((i) => i.str === label);
      if (!l) return null;
      const v = items
        .filter((i) => Math.abs(i.y - l.y) < 1.5 && i.x > l.x + 1)
        .sort((a, b) => a.x - b.x)
        .map((i) => i.str)
        .join(" ");
      return v || null;
    };
    registeredName ??= valueOf("Registered Name");
    period ??= valueOf("Transaction Period");

    // 钱包的表头（只有第 1 页有）：记下每一栏从哪里开始，后面的页沿用。GO+ 的表头最后一栏不一样，不会盖掉
    const header = items.filter((i) => (COLS as readonly string[]).includes(i.str));
    if (COLS.every((c) => header.some((h) => h.str === c))) xs = COLS.map((c) => header.find((h) => h.str === c)!.x);
    if (!xs) continue;
    const cols = xs;

    // 「日期」那一栏：日期 = 一笔交易开始；其他字（区块标题、表头、页尾）= 分界线
    const marks = items.filter((i) => i.x < cols[1] - 2).sort((a, b) => b.y - a.y);
    marks.forEach((m, k) => {
      const d = DATE.exec(m.str);
      if (!d) {
        if (/TRANSACTION/i.test(m.str)) section = m.str;
        return;
      }
      if (section && !/WALLET/i.test(section)) return; // 只要钱包的交易，GO+ 的跳过
      const y0 = m.y;
      const y1 = k + 1 < marks.length ? marks[k + 1].y : -Infinity;
      const cells = new Map<Col, PdfText[]>();
      for (const i of items) {
        if (i.y > y0 + 1 || i.y <= y1 + 1) continue;
        let c = 0;
        for (let j = 0; j < cols.length; j++) if (i.x >= cols[j] - 3) c = j;
        cells.set(COLS[c], [...(cells.get(COLS[c]) ?? []), i]);
      }
      const text = (c: Col) =>
        (cells.get(c) ?? [])
          .sort((a, b) => b.y - a.y || a.x - b.x)
          .map((i) => i.str)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
      rows.push({
        date: `${d[3]}-${d[2].padStart(2, "0")}-${d[1].padStart(2, "0")}`,
        status: text("Status"),
        type: text("Transaction Type"),
        reference: text("Reference").replace(/\s+/g, ""),
        description: text("Description"),
        details: text("Details"),
        amountCents: rm(text("Amount (RM)")),
        balanceCents: rm(text("Wallet Balance")),
      });
    });
  }
  return { registeredName, period, rows };
}

function rm(s: string): number | null {
  const m = /(-)?\s*RM\s?(-)?([\d,]+(?:\.\d{1,2})?)/i.exec(s);
  if (!m) return null;
  const cents = Math.round(Number(m[3].replace(/,/g, "")) * 100);
  return m[1] || m[2] ? -cents : cents;
}

/** 进账说明的开头：看到这个就知道是 PDF 来的（只有日期、没有时间） */
export const STATEMENT_TEXT_PREFIX = "TNG 交易记录";
export const isStatementText = (rawText: string) => rawText.startsWith(STATEMENT_TEXT_PREFIX);

/** 别人转进来的钱：TNG 转账（Receive from Wallet）、银行 DuitNow 转进来（DUITNOW_RECEIVEFROM） */
export function isIncomingTransfer(r: StatementRow): boolean {
  return /^success$/i.test(r.status) && /receive/i.test(r.type.replace(/\s+/g, "")) && !!r.amountCents && r.amountCents > 0;
}

/**
 * 两个名字是不是同一个人：字数一样，每个字最多差一个字母。
 * TNG 登记的名字可能打错一个字（例如 EOMOND / EDMOND），银行那边的名字又是对的。
 */
export function sameName(a: string, b: string): boolean {
  const x = normalizeName(a).split(" ").filter(Boolean);
  const y = normalizeName(b).split(" ").filter(Boolean);
  return x.length > 0 && x.length === y.length && x.every((w, i) => editDistance(w, y[i]) <= 1);
}

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}
