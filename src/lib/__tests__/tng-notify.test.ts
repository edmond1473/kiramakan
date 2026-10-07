import { describe, expect, it } from "vitest";
import { matchSender, normalizeName, noticeText, parseTngNotice, type MatchCandidate } from "../tng-notify";

const p = (t: string) => parseTngNotice(t);

describe("parseTngNotice：收到钱", () => {
  it("英文", () => {
    expect(p("You've received RM10.00 from ALI BIN ABU.")).toMatchObject({
      amountCents: 1000,
      sender: "ALI BIN ABU",
      direction: "in",
    });
    expect(p("Money Received\nYou have received RM 23.40 from TAN AH KOW via DuitNow")).toMatchObject({
      amountCents: 2340,
      sender: "TAN AH KOW",
      direction: "in",
    });
    expect(p("Payment received from ALI BIN ABU, RM10.00")).toMatchObject({ amountCents: 1000, sender: "ALI BIN ABU", direction: "in" });
    expect(p("You've received RM1,234.56 from ALI on 07/10/2026")).toMatchObject({ amountCents: 123456, sender: "ALI" });
  });

  it("名字在前面、或用 by", () => {
    expect(p("ALI BIN ABU has transferred RM10.00 to you")).toMatchObject({ sender: "ALI BIN ABU", direction: "in" });
    expect(p("Ka-ching! SITI sent you RM8.50")).toMatchObject({ sender: "SITI", amountCents: 850, direction: "in" });
    expect(p("RM15.00 has been transferred to your eWallet by RAJESH A/L KUMAR")).toMatchObject({
      sender: "RAJESH A/L KUMAR",
      amountCents: 1500,
      direction: "in",
    });
  });

  it("马来文、中文", () => {
    expect(p("Anda telah menerima RM5.50 daripada SITI NURHALIZA")).toMatchObject({
      amountCents: 550,
      sender: "SITI NURHALIZA",
      direction: "in",
    });
    expect(p("您已收到来自 LIM BENG HUAT 的 RM12.00")).toMatchObject({ amountCents: 1200, sender: "LIM BENG HUAT", direction: "in" });
    expect(p("收到 王小明 转账 RM8.00")).toMatchObject({ amountCents: 800, sender: "王小明", direction: "in" });
  });

  it("余额的金额不会被当成转进来的钱", () => {
    expect(p("Your balance is RM120.50. You've received RM10.00 from ALI").amountCents).toBe(1000);
  });

  it("名字刚好含有 earn / off 之类的字也照样认", () => {
    expect(p("You've received RM10.00 from JOHN KEARNEY")).toMatchObject({ sender: "JOHN KEARNEY", direction: "in" });
  });
});

describe("parseTngNotice：不是朋友转来的", () => {
  it("自己付钱", () => {
    expect(p("You have paid RM10.00 to KFC").direction).toBe("out");
    expect(p("You have successfully transferred RM50.00 to ALI BIN ABU")).toMatchObject({ direction: "out", sender: null });
    expect(p("You have paid RM10.00 to ALI. You received 10 GOpoints.").direction).toBe("out");
    expect(p("Anda telah membayar RM10.00 kepada KFC").direction).toBe("out");
  });
  it("cashback、reload、广告", () => {
    expect(p("You've received RM5.00 cashback!").direction).toBe("other");
    expect(p("Reload of RM50.00 successful").direction).toBe("other");
    expect(p("Spend RM30 and get RM5 off this weekend").direction).toBe("other");
    const go = p("You've received RM0.03 from GO+ earnings");
    expect(go.sender).toBeNull();
    expect(go.direction).toBe("other");
  });
  it("没有金额", () => {
    expect(p("Hello! Check out our new features")).toMatchObject({ amountCents: null, direction: "unknown", sender: null });
  });
});

describe("noticeText", () => {
  it("JSON 摊平、去掉重复", () => {
    expect(noticeText({ title: "Money Received", body: "You've received RM10.00 from ALI", subtitle: "" })).toBe(
      "Money Received\nYou've received RM10.00 from ALI",
    );
    expect(noticeText({ a: "x", b: ["x", { c: "y" }] })).toBe("x\ny");
    expect(noticeText("  plain ")).toBe("plain");
  });
});

describe("normalizeName", () => {
  it("大写、去符号、保留中文和 *", () => {
    expect(normalizeName("  Ali bin  Abu ")).toBe("ALI BIN ABU");
    expect(normalizeName("Rajesh a/l Kumar")).toBe("RAJESH A L KUMAR");
    expect(normalizeName("ALI B** A**")).toBe("ALI B** A**");
    expect(normalizeName("王小明")).toBe("王小明");
  });
});

describe("matchSender", () => {
  const ali: MatchCandidate = { personId: "ali", tngNames: ["ALI BIN ABU"], displayName: "Ali", owes: true };
  const tan: MatchCandidate = { personId: "tan", tngNames: [], displayName: "Tan Ah Kow", owes: false };
  const beng: MatchCandidate = { personId: "beng", tngNames: ["LIM BENG HUAT", "LIM B HUAT"], displayName: "阿明", owes: true };

  it("TNG 名字一样、以前确认过的名字", () => {
    expect(matchSender("Ali Bin Abu", [ali, tan, beng]).personId).toBe("ali");
    expect(matchSender("LIM B HUAT", [ali, tan, beng]).personId).toBe("beng");
  });
  it("打码的名字", () => {
    expect(matchSender("ALI B** A**", [ali, tan, beng]).personId).toBe("ali");
    // 看得到的字太少：不猜
    expect(matchSender("A** B**", [ali, tan, beng]).personId).toBeNull();
  });
  it("少了中间的 BIN，但顺序要对", () => {
    expect(matchSender("ALI ABU", [ali, tan]).personId).toBe("ali");
    expect(matchSender("ABU ALI", [ali, tan]).personId).toBeNull();
  });
  it("用 app 里的名字", () => {
    expect(matchSender("TAN AH KOW", [ali, tan]).personId).toBe("tan");
    // 「Ali」对「ALI BIN AHMAD」：分数低，要他还欠钱才算
    const ali2: MatchCandidate = { personId: "ali2", tngNames: [], displayName: "Ali", owes: true };
    expect(matchSender("ALI BIN AHMAD", [ali2, tan]).personId).toBe("ali2");
    expect(matchSender("ALI BIN AHMAD", [{ ...ali2, owes: false }, tan])).toMatchObject({ personId: null, score: 65 });
  });
  it("两个人一样高分就不猜", () => {
    const a: MatchCandidate = { personId: "a", tngNames: ["CHEN WEI"], displayName: "Chen", owes: true };
    const b: MatchCandidate = { personId: "b", tngNames: ["CHEN WEI"], displayName: "Wei", owes: true };
    expect(matchSender("CHEN WEI", [a, b])).toMatchObject({ personId: null, tied: ["a", "b"] });
  });
  it("还欠钱的人优先", () => {
    const a: MatchCandidate = { personId: "a", tngNames: ["CHEN WEI"], displayName: "Chen", owes: false };
    const b: MatchCandidate = { personId: "b", tngNames: ["CHEN WEI"], displayName: "Wei", owes: true };
    expect(matchSender("CHEN WEI", [a, b]).personId).toBe("b");
  });
  it("对不上", () => {
    expect(matchSender("SOMEONE ELSE", [ali, tan, beng]).personId).toBeNull();
    expect(matchSender(null, [ali]).personId).toBeNull();
  });
});
