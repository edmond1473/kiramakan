"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Image as ImageIcon, Lock, LockOpen, MessageCircle, Pencil, Trash2, UserPlus, Users } from "lucide-react";
import type { BillItemView, BillView } from "@/lib/server/world";
import { api } from "@/lib/client/api";
import { formatRM } from "@/lib/money";
import { ItemAssigner } from "@/components/ItemAssigner";
import { PaymentSheet } from "@/components/PaymentSheet";
import { PeoplePicker } from "@/components/PeoplePicker";
import { Avatar, Button, Group, Money, Notice, PageHeader, Row, StatusChip, cx, formatDate } from "@/components/ui";
import { CopyButton, Sheet, Stepper, toast, useOrigin } from "@/components/ui-client";

export function BillAdmin({
  initialView,
  people,
  me,
  justCreated,
}: {
  initialView: BillView;
  people: { id: string; name: string }[];
  me: { personId: string; name: string; isAdmin: boolean };
  justCreated: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState(initialView);
  const [active, setActive] = useState<string | null>(null);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [itemSheet, setItemSheet] = useState<BillItemView | null>(null);
  const [paySheet, setPaySheet] = useState<{ id: string; name: string; remaining: number } | null>(null);
  const [personSheet, setPersonSheet] = useState<{ id: string; name: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const origin = useOrigin();

  const shareUrl = `${origin}/b/${view.shareToken}`;
  const refresh = useCallback(async () => {
    const v = await api<BillView>(`/api/bills/${view.id}/view`);
    setView(v);
    return v;
  }, [view.id]);

  const participants = view.participants;
  const activeName = participants.find((p) => p.personId === active)?.name;
  const iAmPayer = view.payer.personId === me.personId;
  const unclaimedItems = view.items.filter((i) => i.claimedUnits === 0);
  // 每个人（包括付钱的人自己）要付的加起来；跟总额的差 = 没人认领的部分
  const collectible = view.totalCents - view.unassigned.owed;
  const othersOwe = participants.filter((p) => !p.isPayer).reduce((s, p) => s + p.owed, 0);

  async function setUnits(item: BillItemView, personId: string, units: number) {
    setBusyItem(item.id);
    const shares = item.shares
      .filter((s) => s.personId !== personId)
      .map((s) => ({ personId: s.personId, units: s.units }));
    if (units > 0) shares.push({ personId, units });
    try {
      await api(`/api/bills/${view.id}/shares`, { method: "PUT", body: { itemId: item.id, shares } });
      const v = await refresh();
      if (itemSheet) setItemSheet(v.items.find((i) => i.id === item.id) ?? null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "存不到", "error");
    } finally {
      setBusyItem(null);
    }
  }

  async function setItemAll(item: BillItemView, mode: "all" | "none") {
    setBusyItem(item.id);
    try {
      const shares = mode === "all" ? participants.map((p) => ({ personId: p.personId, units: 1 })) : [];
      await api(`/api/bills/${view.id}/shares`, { method: "PUT", body: { itemId: item.id, shares } });
      const v = await refresh();
      setItemSheet(v.items.find((i) => i.id === item.id) ?? null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "存不到", "error");
    } finally {
      setBusyItem(null);
    }
  }

  async function splitUnclaimed() {
    try {
      await api(`/api/bills/${view.id}/split`, { body: {} });
      await refresh();
      toast("没人认领的 item 已经平分");
    } catch (e) {
      toast(e instanceof Error ? e.message : "出错了", "error");
    }
  }

  async function toggleLock() {
    try {
      await api(`/api/bills/${view.id}`, { method: "PATCH", body: { locked: !view.locked } });
      await refresh();
      toast(view.locked ? "已解锁，朋友可以再改" : "已锁定，朋友不能再改 item");
    } catch (e) {
      toast(e instanceof Error ? e.message : "出错了", "error");
    }
  }

  async function removeBill() {
    if (!window.confirm(`删除「${view.title}」？这张单的 item 和分配都会不见（已记录的付款会保留）。`)) return;
    try {
      await api(`/api/bills/${view.id}`, { method: "DELETE" });
      router.push("/");
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "删不到", "error");
    }
  }

  const whatsappText = useMemo(
    () =>
      `${view.title}（${formatDate(view.billDate)}）总共 ${formatRM(view.totalCents)}，${view.payer.name} 付的。\n点自己吃的东西就会算好含 tax 的金额：\n${shareUrl}`,
    [view.title, view.billDate, view.totalCents, view.payer.name, shareUrl],
  );

  return (
    <main>
      <PageHeader
        title={view.title}
        back={{ href: "/", label: "账本" }}
        subtitle={
          <>
            {formatDate(view.billDate)} · {iAmPayer ? "你付的" : `${view.payer.name} 付的`} ·{" "}
            <span className="tabular">{formatRM(view.totalCents)}</span>
          </>
        }
      />

      <div className="px-4">
        {justCreated && (
          <div className="mt-4">
            <Notice tone="ok">账单建好了。可以在下面帮大家分 item，或直接把 link 丢进 WhatsApp group 让朋友自己点。</Notice>
          </div>
        )}

        <section className="mt-4 rounded-xl bg-surface p-4">
          <p className="text-[15px] leading-5 font-semibold">给朋友的 link</p>
          <p className="mt-1 text-[13px] leading-[18px] text-label-2">朋友打开后选自己的名字、点自己吃的，就看到含 tax 的金额和你的 QR。</p>
          <p className="mt-2 truncate rounded-lg bg-fill px-3 py-2 font-mono text-[12px] text-label-2">{shareUrl || "…"}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`}
              target="_blank"
              rel="noreferrer"
              className="press inline-flex h-11 items-center justify-center gap-1.5 rounded-[10px] bg-tint-fill px-4 text-[15px] font-semibold text-white"
            >
              <MessageCircle className="size-[18px]" strokeWidth={2} /> WhatsApp
            </a>
            <CopyButton text={shareUrl} label="复制 link" variant="gray" />
          </div>
        </section>

        <section className="tabular mt-4 rounded-xl bg-surface p-4" aria-label="对账">
          <p className="text-[15px] leading-5 font-semibold">对账</p>
          <div className="mt-2 space-y-1 text-[15px] leading-[22px]">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-label-2">大家要付的加起来</span>
              <span className="font-semibold">{formatRM(collectible)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-label-2">{iAmPayer ? "你付的总额" : `${view.payer.name} 付的总额`}</span>
              <span className="font-semibold">{formatRM(view.totalCents)}</span>
            </div>
          </div>
          {view.unassigned.owed === 0 ? (
            <p className="mt-2 flex items-center gap-1.5 text-[14px] leading-5 font-medium text-green-text">
              <Check className="size-4" strokeWidth={2.5} aria-hidden /> 一样，{iAmPayer ? "你" : view.payer.name}不会少收
              {othersOwe > 0 && <span className="font-normal text-label-2">（要跟别人收 {formatRM(othersOwe)}）</span>}
            </p>
          ) : (
            <div className="mt-2 rounded-lg bg-[color-mix(in_srgb,var(--red)_12%,transparent)] px-3 py-2.5">
              <p className="text-[14px] leading-5 font-medium">
                差 {formatRM(view.unassigned.owed)}：还有 item 没人认领，现在{iAmPayer ? "你" : view.payer.name}会少收这么多。
              </p>
              {unclaimedItems.length > 0 ? (
                <Button variant="tinted" size="sm" className="mt-2" onClick={splitUnclaimed}>
                  <Users className="size-4" strokeWidth={2} /> 没人认领的 → 大家平分
                </Button>
              ) : (
                <p className="mt-1 text-[13px] leading-[18px] text-label-2">在下面把剩下的份数分给吃的人。</p>
              )}
            </div>
          )}
        </section>

        <section className="mt-6">
          <div className="mb-2 flex items-end justify-between px-4">
            <h2 className="text-[13px] leading-[18px] font-medium text-label-2">分 item：先选人，再点他吃的</h2>
          </div>
          <div
            className="material sticky top-0 z-30 -mx-4 flex gap-2 overflow-x-auto px-4 py-2"
            role="radiogroup"
            aria-label="正在分给谁"
          >
            {participants.map((p) => (
              <button
                key={p.personId}
                role="radio"
                aria-checked={active === p.personId}
                onClick={() => setActive(p.personId)}
                className={cx(
                  "press inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[15px] font-medium",
                  active === p.personId ? "bg-tint-fill text-white" : "bg-surface text-label",
                )}
              >
                {p.personId === me.personId ? `我` : p.name}
              </button>
            ))}
            <button
              onClick={() => setAddOpen(true)}
              className="press inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-tint-soft px-3.5 text-[15px] font-medium text-tint-text"
            >
              <UserPlus className="size-4" strokeWidth={2} /> 加人
            </button>
          </div>
          {!active && <p className="mb-2 px-1 text-[13px] leading-[18px] text-label-2">还没选人：点上面的名字开始。</p>}
          <ItemAssigner
            items={view.items}
            activePersonId={active}
            activeName={activeName}
            busyItemId={busyItem}
            onSetUnits={(itemId, units) => {
              const it = view.items.find((i) => i.id === itemId);
              if (it && active) setUnits(it, active, units);
            }}
            onOpenItem={(it) => setItemSheet(it)}
          />
        </section>

        <Group title="每个人要付" footer={view.factor > 0 ? `倍数 ×${view.factor.toFixed(4)}（总额 ÷ item 加起来）` : undefined}>
          {participants.map((p) => (
            <Row
              key={p.personId}
              leading={<Avatar name={p.name} size={32} tint={p.isPayer} />}
              onClick={() => (p.isPayer ? undefined : setPersonSheet({ id: p.personId, name: p.name }))}
              trailing={
                <div className="flex flex-col items-end">
                  <Money cents={p.owed} className="text-[15px] font-semibold" />
                  <StatusChip status={p.status} remaining={p.remaining} />
                </div>
              }
            >
              <p className="truncate text-[15px] leading-5 font-semibold">{p.personId === me.personId ? `${p.name}（我）` : p.name}</p>
              <p className="tabular mt-0.5 text-[13px] leading-[18px] text-label-2">item {formatRM(p.preTax)}</p>
            </Row>
          ))}
        </Group>

        <Group title="这张单">
          {view.hasReceipt && (
            <Row href={`/api/bills/${view.id}/receipt`} external leading={<ImageIcon className="size-5 text-label-2" strokeWidth={1.75} />} chevron>
              <span className="text-[15px]">看 receipt 照片</span>
            </Row>
          )}
          <Row href={`/bills/${view.id}/edit`} leading={<Pencil className="size-5 text-label-2" strokeWidth={1.75} />} chevron>
            <span className="text-[15px]">修改 item、总额、谁付的</span>
          </Row>
          <Row
            onClick={toggleLock}
            leading={
              view.locked ? (
                <Lock className="size-5 text-label-2" strokeWidth={1.75} />
              ) : (
                <LockOpen className="size-5 text-label-2" strokeWidth={1.75} />
              )
            }
            trailing={<span className="text-[15px] text-tint-text">{view.locked ? "解锁" : "锁定"}</span>}
          >
            <p className="text-[15px]">{view.locked ? "已锁定" : "朋友还可以改"}</p>
            <p className="text-[12px] leading-4 text-label-2">锁定后朋友不能再点 item，金额就固定了。</p>
          </Row>
          <Row onClick={removeBill} leading={<Trash2 className="size-5 text-red-text" strokeWidth={1.75} />}>
            <span className="text-[15px] text-red-text">删除这张单</span>
          </Row>
        </Group>
        <div className="h-6" />
      </div>

      {/* 一个 item 的完整设定 */}
      <Sheet open={!!itemSheet} onClose={() => setItemSheet(null)} title={itemSheet ? `谁吃了 ${itemSheet.name}` : ""}>
        {itemSheet && (
          <div className="pt-1">
            <p className="tabular text-[13px] leading-[18px] text-label-2">
              {itemSheet.qty !== 1 && `×${itemSheet.qty} · `}
              {formatRM(itemSheet.lineCents)}
              {Number.isInteger(itemSheet.qty) && itemSheet.qty > 1
                ? ` · 每份 ${formatRM(Math.round(itemSheet.lineCents / itemSheet.qty))}`
                : " · 几个人一起吃就平分"}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="tinted" size="sm" onClick={() => setItemAll(itemSheet, "all")}>
                全部人平分
              </Button>
              <Button size="sm" onClick={() => setItemAll(itemSheet, "none")}>
                清除
              </Button>
            </div>
            <div className="list mt-4 overflow-hidden rounded-xl bg-surface">
              {participants.map((p) => {
                const units = itemSheet.shares.find((s) => s.personId === p.personId)?.units ?? 0;
                const countable = Number.isInteger(itemSheet.qty) && itemSheet.qty > 1;
                return (
                  <Row
                    key={p.personId}
                    onClick={countable ? undefined : () => setUnits(itemSheet, p.personId, units > 0 ? 0 : 1)}
                    trailing={
                      countable ? (
                        <Stepper
                          value={units}
                          onChange={(v) => setUnits(itemSheet, p.personId, v)}
                          max={itemSheet.qty + 5}
                          label={`${p.name} 的份数`}
                        />
                      ) : (
                        <span
                          className={cx(
                            "flex size-6 items-center justify-center rounded-full border-2",
                            units > 0 ? "border-tint bg-tint text-white" : "border-label-3",
                          )}
                        >
                          {units > 0 && "✓"}
                        </span>
                      )
                    }
                  >
                    <span className="text-[15px]">{p.name}</span>
                  </Row>
                );
              })}
            </div>
          </div>
        )}
      </Sheet>

      {/* 点一个人：记录收款 / 移除 */}
      <Sheet open={!!personSheet} onClose={() => setPersonSheet(null)} title={personSheet?.name}>
        {personSheet &&
          (() => {
            const p = participants.find((x) => x.personId === personSheet.id);
            if (!p) return null;
            return (
              <div className="space-y-3 pt-2">
                <div className="rounded-xl bg-surface p-4">
                  <p className="tabular text-[15px]">
                    这餐要付 <span className="font-semibold">{formatRM(p.owed)}</span>（item {formatRM(p.preTax)}）
                  </p>
                  <div className="mt-1">
                    <StatusChip status={p.status} remaining={p.remaining} />
                  </div>
                </div>
                {(iAmPayer || me.isAdmin) && p.owed > 0 && (
                  <Button
                    variant="filled"
                    full
                    onClick={() => {
                      setPaySheet({ id: p.personId, name: p.name, remaining: p.remaining });
                      setPersonSheet(null);
                    }}
                  >
                    记录 {p.name} 付的钱
                  </Button>
                )}
                <Link
                  href={`/people/${p.personId}`}
                  className="press flex h-11 items-center justify-center rounded-[10px] bg-fill text-[15px] font-semibold"
                >
                  看 {p.name} 的全部账
                </Link>
                <Button
                  variant="danger"
                  full
                  onClick={async () => {
                    try {
                      await api(`/api/bills/${view.id}/participants`, { method: "DELETE", body: { personId: p.personId } });
                      await refresh();
                      setPersonSheet(null);
                    } catch (e) {
                      toast(e instanceof Error ? e.message : "出错了", "error");
                    }
                  }}
                >
                  从这餐移除
                </Button>
              </div>
            );
          })()}
      </Sheet>

      <AddPeopleSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        people={people.filter((p) => !participants.some((x) => x.personId === p.id))}
        onAdd={async (personIds, names) => {
          try {
            await api(`/api/bills/${view.id}/participants`, { body: { personIds, names } });
            await refresh();
            setAddOpen(false);
          } catch (e) {
            toast(e instanceof Error ? e.message : "出错了", "error");
          }
        }}
      />

      {paySheet && (
        <PaymentSheet
          open={!!paySheet}
          onClose={() => setPaySheet(null)}
          from={{ id: paySheet.id, name: paySheet.name }}
          to={{ id: view.payer.personId, name: view.payer.name }}
          suggestedCents={paySheet.remaining}
          onSaved={() => {
            refresh();
            router.refresh();
          }}
        />
      )}
    </main>
  );
}

function AddPeopleSheet(props: {
  open: boolean;
  onClose: () => void;
  people: { id: string; name: string }[];
  onAdd: (ids: string[], names: string[]) => Promise<void>;
}) {
  // 每次打开都重新 mount，选择会自动清空
  return props.open ? <AddPeopleSheetInner {...props} /> : null;
}

function AddPeopleSheetInner({
  onClose,
  people,
  onAdd,
}: {
  onClose: () => void;
  people: { id: string; name: string }[];
  onAdd: (ids: string[], names: string[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [names, setNames] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  return (
    <Sheet
      open
      onClose={onClose}
      title="加人到这餐"
      footer={
        <Button
          variant="filled"
          size="lg"
          full
          loading={busy}
          disabled={selected.size === 0 && names.length === 0}
          onClick={async () => {
            setBusy(true);
            await onAdd([...selected], names);
            setBusy(false);
          }}
        >
          加进来
        </Button>
      }
    >
      <div className="pt-2">
        <PeoplePicker
          people={[...people, ...names.map((n) => ({ id: `new:${n}`, name: n }))]}
          selected={new Set([...selected, ...names.map((n) => `new:${n}`)])}
          onToggle={(id) => {
            if (id.startsWith("new:")) return setNames((xs) => xs.filter((x) => `new:${x}` !== id));
            setSelected((s) => {
              const n = new Set(s);
              if (n.has(id)) n.delete(id);
              else n.add(id);
              return n;
            });
          }}
          onAddName={(n) => {
            const existing = people.find((p) => p.name.toLowerCase() === n.toLowerCase());
            if (existing) setSelected((s) => new Set([...s, existing.id]));
            else if (!names.includes(n)) setNames((xs) => [...xs, n]);
          }}
        />
      </div>
    </Sheet>
  );
}
