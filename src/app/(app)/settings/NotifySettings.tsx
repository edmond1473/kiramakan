"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Send } from "lucide-react";
import { api } from "@/lib/client/api";
import { disablePush, enablePush, preparePush, pushEnv, type PushReady } from "@/lib/client/push";
import { formatRM } from "@/lib/money";
import { Button, Group, Notice, Row, Tag, Toggle, formatWhen } from "@/components/ui";
import { Segmented, Sheet, toast, useIsClient } from "@/components/ui-client";

// 设定页的两组：「TNG 进账自动记录」和「手机通知」

export function TngGroup({ lastNoticeAt, pending }: { lastNoticeAt: string | null; pending: number }) {
  const [testOpen, setTestOpen] = useState(false);
  return (
    <>
      <Group
        title="TNG 进账自动记录"
        footer="朋友用 TNG 转钱给你，iPhone 收到 TNG 的通知时会自动传过来记账。名字对不上、或金额怪怪的，会先放「待确认」等你按一下。"
      >
        <Row href="/settings/tng-setup" chevron>
          <p className="text-[16px] leading-[21px]">iPhone 设定（第一次要做）</p>
          <p className="mt-0.5 text-[13px] leading-[18px] text-label-2">
            {lastNoticeAt ? `最近收到通知：${formatWhen(lastNoticeAt)}` : "还没收到过通知"}
          </p>
        </Row>
        <Row href="/inbox" chevron trailing={pending > 0 ? <Tag tone="flare">{pending} 笔要确认</Tag> : undefined}>
          <span className="text-[16px]">TNG 进账记录</span>
        </Row>
        <Row onClick={() => setTestOpen(true)} chevron>
          <p className="text-[16px] leading-[21px]">试一试</p>
          <p className="mt-0.5 text-[13px] leading-[18px] text-label-2">贴一段 TNG 通知的文字，看会怎么记（不会真的记账）</p>
        </Row>
      </Group>
      <TestSheet open={testOpen} onClose={() => setTestOpen(false)} />
    </>
  );
}

interface TestResult {
  amountCents: number | null;
  sender: string | null;
  direction: string;
  outcome: "record" | "pending" | "ignore" | "unparsed";
  personName: string | null;
  summary: string;
}

const EXAMPLE = "You've received RM23.40 from ALI BIN ABU.";

function TestSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  async function run() {
    setBusy(true);
    try {
      setResult(await api<TestResult>("/api/incoming/test", { body: { text: text || EXAMPLE } }));
    } catch (e) {
      toast(e instanceof Error ? e.message : "出错了", "error");
    } finally {
      setBusy(false);
    }
  }

  const tone = result?.outcome === "record" ? "ok" : result?.outcome === "pending" ? "warn" : "info";
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="试一试"
      footer={
        <Button variant="filled" size="lg" full loading={busy} onClick={run}>
          看会怎么记
        </Button>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="label-mono mb-2 block px-1 text-label-2">TNG 通知的文字</span>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setResult(null);
            }}
            rows={4}
            placeholder={EXAMPLE}
            className="w-full resize-none rounded-[12px] border-[1.5px] border-transparent bg-field px-4 py-3 text-[16px] leading-6 text-label outline-none placeholder:text-label-3 focus:border-label"
          />
        </label>
        {result && (
          <>
            <Notice tone={tone}>{result.summary}</Notice>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-1 text-[14px] leading-5">
              <dt className="text-label-2">金额</dt>
              <dd className="tabular font-semibold">{result.amountCents ? formatRM(result.amountCents) : "看不到"}</dd>
              <dt className="text-label-2">TNG 名字</dt>
              <dd className="font-semibold break-words">{result.sender ?? "看不到"}</dd>
              <dt className="text-label-2">对上</dt>
              <dd className="font-semibold">{result.personName ?? "—"}</dd>
            </dl>
          </>
        )}
        <p className="px-1 text-[12px] leading-[17px] text-label-2">
          还不知道 TNG 的通知长怎样的话，等第一个朋友转钱之后，到「TNG 进账记录」看收到的原文。
        </p>
      </div>
    </Sheet>
  );
}

type SubState = "checking" | "on" | "off";

export function PushGroup({
  devices,
  remindEvery,
  notifyPayments,
}: {
  devices: number;
  remindEvery: number;
  notifyPayments: boolean;
}) {
  const router = useRouter();
  const isClient = useIsClient();
  const env = isClient ? pushEnv() : null;
  const [sub, setSub] = useState<SubState>("checking");
  const [ready, setReady] = useState<PushReady | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // 先准备好 service worker 和金钥：iPhone 要求按钮一按下去就马上订阅
  useEffect(() => {
    if (!env?.supported) return;
    let alive = true;
    (async () => {
      try {
        const r = await preparePush();
        if (!alive) return;
        setReady(r);
        setSub(r.subscribed ? "on" : "off");
      } catch {
        if (alive) setSub("off");
      }
    })();
    return () => {
      alive = false;
    };
  }, [env?.supported]);

  async function run(name: string, fn: () => Promise<void>) {
    setBusy(name);
    try {
      await fn();
    } catch (e) {
      toast(e instanceof Error ? e.message : "出错了", "error");
    } finally {
      setBusy(null);
    }
  }

  const turnOn = () =>
    run("on", async () => {
      if (!ready) throw new Error("还在准备，等一下再按");
      await enablePush(ready);
      setSub("on");
      toast("通知开好了 ✓");
      router.refresh();
      await api("/api/push/test", { body: {} }).catch(() => {});
    });

  const turnOff = () =>
    run("off", async () => {
      await disablePush();
      setSub("off");
      toast("这部手机不会再收到通知");
      router.refresh();
    });

  const patch = (body: Record<string, unknown>, ok: string) =>
    run("patch", async () => {
      await api("/api/me", { method: "PATCH", body });
      toast(ok);
      router.refresh();
    });

  let status: React.ReactNode;
  if (!env) {
    status = <p className="text-[14px] leading-5 text-label-2">检查中…</p>;
  } else if (!env.supported && env.ios && !env.standalone) {
    status = (
      <div className="space-y-3 text-[14px] leading-[21px]">
        <p className="font-semibold">iPhone 要先把 KiraMakan 加到主画面，才可以开通知：</p>
        <ol className="list-decimal space-y-1.5 pl-5 text-label-2">
          <li>用 Safari 打开这个网站</li>
          <li>按「分享」按钮（找不到的话先按「⋯」）</li>
          <li>选「加入主画面」，再按「加入」</li>
          <li>从主画面的 KiraMakan 打开，回到这一页按「开启通知」</li>
        </ol>
      </div>
    );
  } else if (!env.supported) {
    status = <p className="text-[14px] leading-5 text-label-2">这个浏览器不支持通知。iPhone 请用 Safari，加到主画面后再打开。</p>;
  } else if (isClient && Notification.permission === "denied") {
    status = (
      <Notice tone="warn">通知被关掉了。到 iPhone「设定 → 通知 → KiraMakan」打开「允许通知」，再回来这里按「开启通知」。</Notice>
    );
  } else if (sub === "on") {
    status = (
      <div className="flex items-center justify-between gap-3">
        <p className="text-[15px] leading-5 font-semibold">这部手机已开通知 ✓</p>
        <Tag tone="forest">开着</Tag>
      </div>
    );
  } else {
    status = <p className="text-[14px] leading-5 text-label-2">开了之后，有人转钱给你、或每隔一天还有人没还钱，会通知你。</p>;
  }

  const canOn = !!env?.supported && sub === "off" && (!isClient || Notification.permission !== "denied");

  return (
    <Group
      title="手机通知"
      footer={
        devices > 0
          ? `这个帐号有 ${devices} 部手机 / 电脑开了通知。提醒大约在晚上 9 点到 10 点之间发。`
          : "提醒大约在晚上 9 点到 10 点之间发。"
      }
    >
      <div className="space-y-4 p-5">
        {status}
        {canOn && (
          <Button variant="filled" size="lg" full loading={busy === "on"} disabled={!ready} onClick={turnOn}>
            {busy !== "on" && <BellRing className="size-[18px]" strokeWidth={2.25} />} 开启通知
          </Button>
        )}
        {sub === "on" && (
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="tinted"
              full
              loading={busy === "test"}
              onClick={() =>
                run("test", async () => {
                  await api("/api/push/test", { body: {} });
                  toast("发出了，看看手机");
                })
              }
            >
              {busy !== "test" && <Send className="size-4" strokeWidth={2.25} />} 测试
            </Button>
            <Button variant="gray" full loading={busy === "off"} onClick={turnOff}>
              关掉
            </Button>
          </div>
        )}
      </div>

      <div className="row border-t border-separator px-5 py-4">
        <p className="label-mono mb-2.5 text-label-2">提醒我谁还没还钱</p>
        <Segmented
          label="提醒频率"
          value={String(remindEvery) as "0" | "1" | "2"}
          onChange={(v) =>
            patch({ remindEvery: Number(v) }, v === "0" ? "不会再提醒" : v === "1" ? "每天提醒" : "每隔一天提醒")
          }
          options={[
            { value: "1", label: "每天" },
            { value: "2", label: "每隔一天" },
            { value: "0", label: "不要" },
          ]}
        />
      </div>
      <Row
        onClick={() =>
          patch({ notifyPayments: !notifyPayments }, notifyPayments ? "只在有问题时通知" : "每笔都会通知")
        }
        trailing={<Toggle on={notifyPayments} />}
      >
        <p className="text-[16px] leading-[21px]">每笔自动记好都通知我</p>
        <p className="mt-0.5 text-[12px] leading-4 text-label-2">关掉的话只通知要你处理的：少给 tax、不知道是谁</p>
      </Row>
      {devices > 0 && (
        <Row
          onClick={() =>
            run("remind", async () => {
              const r = await api<{ empty: boolean }>("/api/push/remind-now", { body: {} });
              toast(r.empty ? "没有人欠你钱 ✓（已发通知）" : "提醒发出了，看看手机");
            })
          }
          chevron
        >
          <span className="text-[16px]">现在提醒我一次</span>
        </Row>
      )}
    </Group>
  );
}
