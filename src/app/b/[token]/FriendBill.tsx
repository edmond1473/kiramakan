"use client";

import { useState, useSyncExternalStore } from "react";
import { Lock, UserPlus } from "lucide-react";
import type { BillView } from "@/lib/server/world";
import { api } from "@/lib/client/api";
import { formatRM } from "@/lib/money";
import { ItemAssigner } from "@/components/ItemAssigner";
import { PayCard } from "@/components/PayCard";
import { Avatar, Button, Group, Money, Notice, Row, StatusChip, cx, formatDate } from "@/components/ui";
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

  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-[calc(110px+env(safe-area-inset-bottom))]">
      <header className="px-4 pt-6">
        <p className="text-[13px] leading-[18px] font-medium text-label-2">
          {formatDate(view.billDate)} · {view.payer.name} 付的
        </p>
        <h1 className="mt-1 text-[28px] leading-[34px] font-bold tracking-[-0.01em]">{view.title}</h1>
        <p className="tabular mt-1 text-[15px] leading-[22px] text-label-2">
          总共 {formatRM(view.totalCents)}
          {view.factor > 1.0001 && ` · 含 tax / service（每 RM 1 的 item 要付 RM ${view.factor.toFixed(2)}）`}
        </p>
      </header>

      <div className="px-4">
        {view.locked && (
          <div className="mt-4">
            <Notice>
              <span className="inline-flex items-center gap-1.5">
                <Lock className="size-4" strokeWidth={2} /> {view.payer.name} 已经锁定这张单，item 不能再改。
              </span>
            </Notice>
          </div>
        )}

        {ready && !meP && (
          <section className="mt-5 rounded-xl bg-surface p-4">
            <p className="text-[17px] leading-6 font-semibold">你是谁？</p>
            <p className="mt-1 text-[13px] leading-[18px] text-label-2">点你的名字，然后点你吃了的东西。</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {others.map((p) => (
                <button
                  key={p.personId}
                  onClick={() => choose(p.personId)}
                  className="press inline-flex h-10 items-center rounded-full bg-fill px-4 text-[15px] font-medium"
                >
                  {p.name}
                </button>
              ))}
              {!view.locked && (
                <button
                  onClick={() => setShowJoin(true)}
                  className="press inline-flex h-10 items-center gap-1 rounded-full bg-tint-soft px-4 text-[15px] font-medium text-tint-text"
                >
                  <UserPlus className="size-4" strokeWidth={2} /> 名单里没有我
                </button>
              )}
            </div>
            {showJoin && (
              <div className="mt-3 flex gap-2">
                <input
                  autoFocus
                  value={joinName}
                  onChange={(e) => setJoinName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && join()}
                  placeholder="你的名字"
                  aria-label="你的名字"
                  className="h-11 min-w-0 flex-1 rounded-[10px] border border-separator bg-surface px-3.5 text-[16px] outline-none focus:border-tint"
                />
                <Button variant="filled" loading={joining} disabled={!joinName.trim()} onClick={join}>
                  加入
                </Button>
              </div>
            )}
            <button
              onClick={() => choose(view.payer.personId)}
              className="mt-4 text-[13px] leading-[18px] text-tint-text"
            >
              我是 {view.payer.name}（付钱的人）
            </button>
          </section>
        )}

        {meP && (
          <div className="mt-4 flex items-center justify-between rounded-xl bg-surface px-4 py-2.5">
            <span className="flex items-center gap-2 text-[15px]">
              <Avatar name={meP.name} size={28} tint />
              你是 <span className="font-semibold">{meP.name}</span>
            </span>
            <button onClick={() => choose(null)} className="text-[15px] text-tint-text">
              换人
            </button>
          </div>
        )}

        <section className="mt-6">
          <h2 className="mb-2 px-4 text-[13px] leading-[18px] font-medium text-label-2">
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
              leading={<Avatar name={p.name} size={32} tint={p.personId === me} />}
              trailing={
                <div className="flex flex-col items-end">
                  {p.owed > 0 && <Money cents={p.owed} className="text-[15px] font-semibold" />}
                  <StatusChip status={p.status} remaining={p.remaining} />
                </div>
              }
            >
              <span className={cx("text-[15px]", p.personId === me && "font-semibold")}>{p.name}</span>
            </Row>
          ))}
        </Group>
        {view.unassigned.owed > 0 && (
          <p className="mt-2 px-4 text-[12px] leading-4 text-label-2">
            还有 {formatRM(view.unassigned.owed)} 的 item 没人认领。
          </p>
        )}
        <p className="mt-6 px-4 text-center text-[12px] leading-4 text-label-3">KiraMakan · 拍 receipt 自动分账</p>
      </div>

      {meP && !meP.isPayer && (
        <div className="material bottom-safe fixed inset-x-0 z-40 border-t border-separator">
          <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] leading-4 text-label-2">{meP.status === "paid" ? "你这餐" : "你要付"}</p>
              {meP.status === "paid" ? (
                <p className="text-[17px] leading-6 font-semibold text-green-text">已付 ✓</p>
              ) : (
                <p className="tabular text-[22px] leading-7 font-bold">
                  {formatRM(payAmount)}
                  {meP.status === "forgot_tax" && <span className="ml-2 text-[13px] font-medium text-orange-text">补 tax</span>}
                </p>
              )}
            </div>
            {meP.status !== "paid" && meP.owed > 0 && (
              <Button variant="filled" size="lg" onClick={() => setPayOpen(true)}>
                去付款
              </Button>
            )}
          </div>
        </div>
      )}
      {meP && meP.isPayer && (
        <div className="material bottom-safe fixed inset-x-0 z-40 border-t border-separator">
          <div className="mx-auto max-w-lg px-4 py-3 text-[15px]">
            你是付钱的人。还没付的：
            {others.filter((p) => p.owed > 0 && p.status !== "paid").map((p) => p.name).join("、") || "没有了 ✓"}
          </div>
        </div>
      )}

      <Sheet open={payOpen} onClose={() => setPayOpen(false)} title="付款">
        {meP && (
          <div className="pt-1 pb-2">
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
            <p className="mt-3 px-1 text-[12px] leading-4 text-label-2">
              付了之后不用回来按什么，{view.payer.name} 那边会记录。
            </p>
          </div>
        )}
      </Sheet>
      <Toaster />
    </div>
  );
}
