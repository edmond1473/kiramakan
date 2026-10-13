import { describe, expect, it } from "vitest";
import { isIncomingTransfer, parseStatement, pdfDate, periodRange, sameName, type PdfText } from "../tng-statement";

// 照 TNG 导出的 PDF 排版做的假资料（y 越大越上面；每一栏从固定的 x 开始）
const X = { date: 20, status: 80, type: 140, ref: 230, desc: 295, details: 460, amount: 658, balance: 750 };
const t = (str: string, x: number, y: number): PdfText => ({ str, x, y });

function row(y: number, date: string, type: string, ref: string[], desc: string[], amount: string, balance: string): PdfText[] {
  return [
    t(date, X.date, y),
    t("Success", X.status, y),
    t(type, X.type, y),
    ...ref.map((r, i) => t(r, X.ref, y - 12 * i)),
    ...desc.map((d, i) => t(d, X.desc, y - 12 * i)),
    t("2026091410110000010000TNGOW3", X.details, y),
    t(amount, X.amount + 18, y),
    t(balance, X.balance + 26, y),
  ];
}

const header = (y: number, last = "Wallet Balance") =>
  [
    ["Date", X.date],
    ["Status", X.status],
    ["Transaction Type", X.type],
    ["Reference", X.ref],
    ["Description", X.desc],
    ["Details", X.details],
    ["Amount (RM)", X.amount],
    [last, X.balance],
  ].map(([s, x]) => t(s as string, x as number, y));

const footer = [t("*This is a system generated email. Please do not reply.", 20, 40), t("+603 5022 3888. The operating hours are", 20, 28)];

const page1: PdfText[] = [
  t("TNG WALLET TRANSACTION HISTORY", 291, 478),
  t("Registered Name", 20, 450),
  t("AHMAD BIN ALI", 190, 450),
  t("Transaction Period", 20, 380),
  t("14 September 2026 - 13 October 2026", 190, 380),
  t("TNG WALLET TRANSACTION", 20, 354),
  ...header(336),
  ...row(321, "14/9/2026", "Reload", ["20260914101", "10000010000"], ["Quick Reload Payment (via GO+", "Balance)"], "RM16.20", "RM16.20"),
  ...row(280, "14/9/2026", "Receive from Wallet", ["20260914111", "21700010300", "17132464454", "3886"], ["TAN AH KOW"], "RM28.70", "RM28.70"),
  ...footer,
];
const page2: PdfText[] = [
  ...row(540, "20/9/2026", "DUITNOW_RECEI VEFROM", ["20260920111", "21700010100", "17137897412", "0925"], ["AHMED BIN ALI"], "RM500.00", "RM500.00"),
  ...row(490, "21/9/2026", "Receive from Wallet", ["20260921111", "21700010300", "17100000000", "0001"], ["SITI NURHALIZA"], "RM1,234.50", "RM1,734.50"),
  t("GO+ TRANSACTION", 20, 450),
  ...header(432, "GO+ Balance"),
  ...row(417, "14/9/2026", "GO+ Cash In", ["MMF2026091", "41310030885"], ["Cash In"], "RM28.70", "RM250.54"),
  ...footer,
];

describe("parseStatement", () => {
  const s = parseStatement([page1, page2]);

  it("读到帐户资料", () => {
    expect(s.registeredName).toBe("AHMAD BIN ALI");
    expect(s.period).toBe("14 September 2026 - 13 October 2026");
  });

  it("每一笔拆回各栏；跨行的交易编号接起来；GO+ 区块和页尾不算", () => {
    expect(s.rows).toHaveLength(4);
    expect(s.rows[1]).toMatchObject({
      date: "2026-09-14",
      status: "Success",
      type: "Receive from Wallet",
      reference: "202609141112170001030017132464454" + "3886",
      description: "TAN AH KOW",
      amountCents: 2870,
      balanceCents: 2870,
    });
    expect(s.rows[0].description).toBe("Quick Reload Payment (via GO+ Balance)");
    expect(s.rows[3]).toMatchObject({ date: "2026-09-21", amountCents: 123450, description: "SITI NURHALIZA" });
    expect(s.rows.some((r) => /GO\+ Cash/.test(r.type))).toBe(false);
  });

  it("只挑别人转进来的钱", () => {
    expect(s.rows.filter(isIncomingTransfer).map((r) => r.description)).toEqual(["TAN AH KOW", "AHMED BIN ALI", "SITI NURHALIZA"]);
  });

  it("没有表头就读不到（不是 TNG 的 PDF）", () => {
    expect(parseStatement([[t("hello", 20, 300)]]).rows).toEqual([]);
  });
});

describe("sameName", () => {
  it("每个字最多差一个字母", () => {
    expect(sameName("EOMOND LEE JUN XIANG", "Edmond Lee Jun Xiang")).toBe(true);
    expect(sameName("AHMAD BIN ALI", "AHMED BIN ALI")).toBe(true);
    expect(sameName("AHMAD BIN ALI", "AHMAD BIN ABU")).toBe(false);
    expect(sameName("TAN AH KOW", "TAN AH")).toBe(false);
  });
});

describe("periodRange / pdfDate", () => {
  it("读懂 PDF 上的日期范围", () => {
    expect(periodRange("14 September 2026 - 13 October 2026")).toEqual({ start: "2026-09-14", end: "2026-10-13" });
    expect(periodRange("1 Oct 2026 - 2 Oct 2026")).toEqual({ start: "2026-10-01", end: "2026-10-02" });
    expect(periodRange(null)).toBeNull();
    expect(periodRange("whatever")).toBeNull();
  });

  it("读懂 PDF 的导出时间（马来西亚时间）", () => {
    expect(pdfDate("D:20261013105301+08'00'")).toBe("2026-10-13T02:53:01.000Z");
    expect(pdfDate("D:20261013105301Z")).toBe("2026-10-13T10:53:01.000Z");
    expect(pdfDate(undefined)).toBeNull();
    expect(pdfDate("garbage")).toBeNull();
  });
});
