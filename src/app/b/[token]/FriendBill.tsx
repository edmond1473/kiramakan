"use client";

import { useState, useSyncExternalStore } from "react";
import { Lock, UserPlus } from "lucide-react";
import type { BillView } from "@/lib/server/world";
import { api } from "@/lib/client/api";
import { formatRM } from "@/lib/money";
import { ItemAssigner } from "@/components/ItemAssigner";
import { PayCard } from "@/components/PayCard";
import { Avatar, BigMoney, Button, Group, Hero, Money, Notice, Row, StatusChip, Tag, cx, formatDate } from "@/components/ui";
import { Sheet, Toaster, toast, useIsClient } from "@/components/ui-client";

const ME_KEY = "km:me";
const ME_EVENT = "km-me-change";
let memoryMe: string | null = null; // localStorage 不能用（例如私密浏览）时的后备

function readMe(): string | null {
  try {
    return localStorage.getItem(ME_KEY) ?? memoryMe;
  } catch {
    return memoryMe;
  }
}
function writeMe(id: string | null) {
  memoryMe = id;
  try {
    if (id) localStorage.setItem(ME_KEY, id);
    else localStorage.removeItem(ME_KEY);
  } catch {
    // 私密浏览模式等：只记在这一页
  }
  window.dispatchEvent(new Event(ME_EVENT));
}
function subscribeMe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(ME_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(ME_EVENT, cb);
  };
}

export function FriendBill({ token, initialView }: { token: string; initialView: BillView }) {
  const [view, setView] = useState(initialView);
  const ready = useIsClient();
  const storedMe = useSyncExternalStore(subscribeMe, readMe, () => null);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [joinName, setJoinName] = useState("");
  const [joining, setJoining] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  const me = storedMe && view.participants.some((p) => p.personId === storedMe) ? storedMe : null;

  const meP = view.participants.find((p) => p.personId === me) ?? null;
  const others = view.participants.filter((p) => !p.isPayer);

  function choose(id: string | null) {
    writeMe(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function claim(itemId: string, units: number) {
    if (!me) return;
    setBusyItem(itemId);
    try {
      const v = await api<BillView>(`/api/share/${token}/claim`, { body: { personId: me, itemId, units } });
      setView(v);
    } catch (e) {
      toast(e instanceof Error ? e.message : "存不到，再试一次", "error");
      try {
        setView(await api<BillView>(`/api/share/${token}`));
      } catch {
        // 忽略
      }
    } finally {
      setBusyItem(null);
    }
  }

  async function join() {
    const n = joinName.trim();
    if (!n) return;
    setJoining(true);
    try {
      const r = await api<{ personId: string; view: BillView }>(`/api/share/${token}/join`, { body: { name: n } });
      setView(r.view);
      choose(r.personId);
      setShowJoin(false);
      setJoinName("");
    } catch (e) {
      toast(e instanceof Error ? e.message : "加不到", "error");
    } finally {
      setJoining(false);
    }
  }

  const payAmount = meP ? (meP.remaining > 0 ? meP.remaining : meP.owed) : 0;
  const unpaidOthers = others.filter((p) => p.owed > 0 && p.status !== "paid");

  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-[calc(128px+env(safe-area-inset-bottom))]">
      <Hero className="pt-[max(10px,env(safe-area-inset-top))]">
        <div className="flex h-12 items-center justify-between gap-3">
          <span className="display text-[20px] tracking-[-0.035em]">KiraMakan</span>
          <span className="label-mono opacity-70">{formatDate(view.billDate)}</span>
        </div>
        <p className="label-mono mt-8">{view.payer.name} 付的</p>
        <h1 className="display mt-3 text-[46px] leading-[0.95] text-balance break-words">{view.title}</h1>
        <p className="tabular mt-4 text-[15px] leading-[22px]">
          总共 <span className="font-semibold">{formatRM(view.totalCents)}</span>
          {view.factor > 1.0001 && `，含 tax / service：每 RM 1 的 item 要付 RM ${view.factor.toFixed(2)}`}
        </p>
      </Hero>

      <div className="px-4">
        {view.locked && (
          <div className="mt-6">
            <Notice>
              <span className="inline-flex items-center gap-2">
                <Lock className="size-4 shrink-0" strokeWidth={2.25} /> {view.payer.name} 已经锁定这张单，item 不能再改。
              </span>
            </Notice>
          </div>
        )}

        {ready && !meP && (
          <section className="card mt-6 rounded-[24px] bg-surface p-5">
            <p className="display text-[30px]">你是谁？</p>
            <p className="mt-2 text-[14px] leading-5 text-label-2">点你的名字，然后点你吃了的东西。</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {others.map((p) => (
                <button
                  key={p.personId}
                  onClick={() => choose(p.personId)}
                  className="press inline-flex h-12 items-center gap-2.5 rounded-full bg-bg pr-5 pl-1.5 text-[16px] font-semibold ring-1 ring-separator active:bg-fill"
                >
                  <Avatar name={p.name} size={36} />
                  {p.name}
                </button>
              ))}
              {!view.locked && (
                <button
                  onClick={() => setShowJoin(true)}
                  className="press label-mono inline-flex h-12 items-center gap-1.5 rounded-full border-[1.5px] border-dashed border-label-3 px-4 text-label"
                >
                  <UserPlus className="size-4" strokeWidth={2.25} /> 名单里没有我
                </button>
              )}
            </div>
            {showJoin && (
              <div className="mt-4 flex gap-2">
                <input
                  autoFocus
                  value={joinName}
                  onChange={(e) => setJoinName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && join()}
                  placeholder="你的名字"
                  aria-label="你的名字"
                  className="h-12 min-w-0 flex-1 rounded-[12px] border-[1.5px] border-transparent bg-field px-4 text-[16px] outline-none placeholder:text-label-3 focus:border-label"
                />
                <Button variant="tinted" loading={joining} disabled={!joinName.trim()} onClick={join}>
                  加入
                </Button>
              </div>
            )}
            <button
              onClick={() => choose(view.payer.personId)}
              className="mt-5 text-[13px] leading-[18px] text-label-2 underline underline-offset-4"
            >
              我是 {view.payer.name}（付钱的人）
            </button>
          </section>
        )}

        {meP && (
          <div className="mt-6 flex items-center justify-between gap-3 rounded-full bg-surface p-1.5">
            <span className="flex min-w-0 items-center gap-2.5 text-[15px]">
              <Avatar name={meP.name} size={36} tint />
              <span className="truncate">
                你是 <span className="font-semibold">{meP.name}</span>
              </span>
            </span>
            <Button size="sm" onClick={() => choose(null)}>
              换人
            </Button>
          </div>
        )}

        <section className="mt-8">
          <h2 className="label-mono mb-2.5 px-1 text-label-2">
            {meP && !view.locked ? "点你吃了的东西（几个人一起吃就一起点）" : "这餐吃了什么"}
          </h2>
          <ItemAssigner
            items={view.items}
            activePersonId={meP ? meP.personId : null}
            activeName={meP?.name}
            disabled={view.locked || !meP}
            busyItemId={busyItem}
            onSetUnits={claim}
          />
        </section>

        <Group title="大家的状况">
          {view.participants.map((p) => (
            <Row
              key={p.personId}
              leading={<Avatar name={p.name} size={36} tint={p.personId === me} />}
              trailing={
                <div className="flex flex-col items-end gap-1">
                  {p.owed > 0 && <Money cents={p.owed} className="text-[16px] font-semibold" />}
                  <StatusChip status={p.status} remaining={p.remaining} />
                </div>
              }
            >
              <span className={cx("text-[16px]", p.personId === me && "font-semibold")}>{p.name}</span>
            </Row>
          ))}
        </Group>
        {view.unassigned.owed > 0 && (
          <p className="mt-2.5 px-1 text-[12px] leading-4 text-label-2">还有 {formatRM(view.unassigned.owed)} 的 item 没人认领。</p>
        )}
        <p className="label-mono mt-10 text-center text-label-3">KiraMakan · 拍 receipt 自动分账</p>
      </div>

      {meP && (
        <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-lg items-center gap-3 rounded-[30px] bg-ink py-2 pr-2 pl-5 text-white dark:bg-surface-2 dark:ring-1 dark:ring-separator">
            {meP.isPayer ? (
              <p className="min-h-11 flex-1 py-2.5 pr-3 text-[15px] leading-[22px]">
                你是付钱的人。还没付的：{unpaidOthers.map((p) => p.name).join("、") || "没有了 ✓"}
              </p>
            ) : (
              <>
                <div className="min-w-0 flex-1 py-1">
                  <p className="label-mono text-white/60">{meP.status === "paid" ? "你这餐" : "你要付"}</p>
                  {meP.status === "paid" ? (
                    <p className="display mt-1 text-[26px] text-volt">已付 ✓</p>
                  ) : (
                    <div className="mt-1 flex items-center gap-2">
                      <BigMoney cents={payAmount} className="text-[30px] leading-none" />
                      {meP.status === "forgot_tax" && <Tag tone="flare">补 tax</Tag>}
                    </div>
                  )}
                </div>
                {meP.status !== "paid" && meP.owed > 0 && (
                  <Button variant="filled" size="lg" className="px-6" onClick={() => setPayOpen(true)}>
                    去付款
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <Sheet open={payOpen} onClose={() => setPayOpen(false)} title="付款">
        {meP && (
          <div className="pb-2">
            {meP.status === "forgot_tax" && (
              <div className="mb-3">
                <Notice tone="warn">你之前只给了 item 的钱，还差 tax / service charge。</Notice>
              </div>
            )}
            <PayCard
              payee={view.payer}
              amountCents={payAmount}
              breakdown={meP.paid === 0 ? { preTax: meP.preTax, owed: meP.owed } : null}
            />
            <p className="mt-3 px-1 text-[12px] leading-[17px] text-label-2">付了之后不用回来按什么，{view.payer.name} 那边会记录。</p>
          </div>
        )}
      </Sheet>
      <Toaster />
    </div>
  );
}
