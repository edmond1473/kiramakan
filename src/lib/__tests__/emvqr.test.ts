import { describe, expect, it } from "vitest";
import { crc16, inspectEmv, parseTlv, serializeTlv, withAmount } from "../emvqr";

// 用标准测试向量和自己组的 DuitNow 样本（不是真户口）
function build(tlvs: { id: string; value: string }[]) {
  const s = serializeTlv(tlvs) + "6304";
  return s + crc16(s);
}

const sample = build([
  { id: "00", value: "01" },
  { id: "01", value: "11" },
  { id: "26", value: "0014A0000006150001010689005402100000012345" },
  { id: "52", value: "4829" },
  { id: "53", value: "458" },
  { id: "58", value: "MY" },
  { id: "59", value: "JUSBIE TEST" },
  { id: "60", value: "KUALA LUMPUR" },
]);

describe("emvqr", () => {
  it("CRC-16/CCITT-FALSE 标准测试向量", () => {
    expect(crc16("123456789")).toBe("29B1");
  });

  it("认得出 DuitNow EMV QR", () => {
    const info = inspectEmv(sample);
    expect(info.isEmv).toBe(true);
    expect(info.crcValid).toBe(true);
    expect(info.isDuitNow).toBe(true);
    expect(info.merchantName).toBe("JUSBIE TEST");
  });

  it("加金额后 CRC 正确、tag 01=12、tag 54 在 53 后面", () => {
    const out = withAmount(sample, 2915)!;
    const info = inspectEmv(out);
    expect(info.crcValid).toBe(true);
    expect(info.amount).toBe("29.15");
    const tlvs = parseTlv(out)!;
    expect(tlvs.find((t) => t.id === "01")!.value).toBe("12");
    const ids = tlvs.map((t) => t.id);
    expect(ids.indexOf("54")).toBe(ids.indexOf("53") + 1);
    expect(ids[ids.length - 1]).toBe("63");
  });

  it("重复加金额会替换旧金额", () => {
    const once = withAmount(sample, 1000)!;
    const twice = withAmount(once, 500)!;
    expect(inspectEmv(twice).amount).toBe("5.00");
    expect(parseTlv(twice)!.filter((t) => t.id === "54").length).toBe(1);
  });

  it("不是 EMV 的内容（例如网址）不能加金额", () => {
    expect(withAmount("https://example.com/pay/abc", 1000)).toBeNull();
    expect(inspectEmv("hello").isEmv).toBe(false);
  });
});
