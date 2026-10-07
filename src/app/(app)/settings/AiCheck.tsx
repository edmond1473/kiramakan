"use client";

import { useState } from "react";
import { Activity } from "lucide-react";
import { api } from "@/lib/client/api";
import type { ProviderCheck } from "@/lib/server/ocr";
import { Button, Group, Tag, cx } from "@/components/ui";
import { toast } from "@/components/ui-client";

/** 设定页：检查读 receipt 的 AI（key、每个模型、DeepSeek 余额） */
export function AiCheck() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ProviderCheck[] | null>(null);

  async function run() {
    setBusy(true);
    try {
      const r = await api<{ providers: ProviderCheck[] }>("/api/ai/check", { method: "POST" });
      setResult(r.providers);
    } catch (e) {
      toast(e instanceof Error ? e.message : "检查不到", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Group
      title="读 receipt 的 AI"
      footer="检查时每个模型会发一个很短的测试请求，会用掉 1 次额度。读不到 receipt 时先按这里看原因。"
    >
      <div className="p-5">
        <p className="text-[14px] leading-5 text-label-2">看两个 API key 有没有效、每个模型能不能用、DeepSeek 还有多少余额。</p>
        <Button variant="tinted" full className="mt-4" loading={busy} onClick={run}>
          {!busy && <Activity className="size-4" strokeWidth={2.25} />} 检查 AI
        </Button>
      </div>
      {result?.map((p) => (
        <div key={p.id} className="row border-t border-separator px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[17px] leading-6 font-semibold">{p.label}</p>
            <Tag tone={!p.configured ? "mist" : p.ok ? "forest" : "flare"}>
              {!p.configured ? "没设定" : p.ok ? "能用 ✓" : "不能用"}
            </Tag>
          </div>
          <p className="mt-1 text-[13px] leading-[19px] text-label-2">{p.message}</p>
          {p.balance && (
            <p className="mt-2 text-[14px] leading-5">
              余额 <span className="tabular font-semibold">{p.balance.text}</span>
            </p>
          )}
          {p.models.length > 0 && (
            <ul className="mt-3 space-y-2">
              {p.models.map((m) => (
                <li key={m.model} className="flex items-start gap-2.5 text-[13px] leading-[19px]">
                  <span
                    aria-hidden
                    className={cx("mt-1.5 size-2 shrink-0 rounded-full", m.ok ? "bg-forest" : "bg-flare")}
                  />
                  <span className="min-w-0">
                    <span className="font-mono text-[12px] tracking-[0.02em]">{m.model}</span>
                    <span className="text-label-2">：{m.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </Group>
  );
}
