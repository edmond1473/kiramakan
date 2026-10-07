"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BellOff, Undo2 } from "lucide-react";
import { api } from "@/lib/client/api";
import { formatRM } from "@/lib/money";
import type { PendingReason } from "@/lib/remind";
import { Avatar, BigMoney, Button, Empty, Group, LinkButton, Money, PageHeader, Row, Tag, cx, formatWhen } from "@/components/ui";
import { Sheet, toast } from "@/components/ui-client";

export interface PersonOpt {
  id: string;
  name: string;
  owed: number;
}

export interface Suggestion extends PersonOpt {
  hint: string | null;
}

export interface PendingV {
  id: string;
  amountCents: number | null;
  senderName: string | null;
  rawText: string;
  receivedAt: string;
  reason: PendingReason | null;
  /** 名字对上了、但要你确认的人（多给了 / 没欠钱 / 看不出收钱还是付钱） */
  person: PersonOpt | null;
  suggestions: Suggestion[];
}

export interface RecordedV {
  id: string;
  amountCents: number;
  personId: string | null;
  personName: string;
  verdict: string | null;
  verdictKind: string | null;
  receivedAt: string;
  /** true = 自动记的；false = 你按了确认 */
  auto: boolean;
}

export interface OtherV {
  id: string;
  amountCents: number | null;
  rawText: string;
  receivedAt: string;
  status: "ignored" | "unparsed" | "pending" | "recorded";
  direction: string;
}

type Pick = { id: string; amountCents: number | null; senderName: string | null };

export function Inbox({
  pending,
  recorded,
  others,
  people,
}: {
  pending: PendingV[];
  recorded: RecordedV[];
  others: OtherV[];
  people: PersonOpt[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [pick, setPick] = useState<Pick | null>(null);

  async function act(key: string, id: string, body: Record<string, unknown>, ok: (r: { message?: string; name?: string }) => string) {
    setBusy(key);
    try {
      const r = await api<{ message?: string; name?: string }>(`/api/incoming/${id}`, { body });
      toast(ok(r));
      setPick(null);
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "出错了", "error");
    } finally {
      setBusy(null);
    }
  }

  const assign = (id: string, personId: string, amountCents?: number) =>
    act(`assign:${id}:${personId}:${amountCents ?? ""}`, id, { action: "assign", personId, amountCents: amountCents ?? null }, (r) =>
      `已记给 ${r.name}：${r.message}`,
    );
  const ignore = (id: string) => act(`ignore:${id}`, id, { action: "ignore" }, () => "好，这笔不记");
  const undo = (id: string) => {
    if (!window.confirm("撤销这笔记录？会删掉这笔付款，通知回到「待确认」。")) return;
    void act(`undo:${id}`, id, { action: "undo" }, () => "已撤销，可以重新选是谁");
  };

  const nothing = pending.length + recorded.length + others.length === 0;

  return (
    <main>
      <PageHeader
        title="TNG 进账"
        back={{ href: "/", label: "账本" }}
        subtitle="朋友转钱给你时 iPhone 收到的 TNG 通知。对得上的自动记好；对不上的在这里按一下。"
      />
      <div className="px-4">
        {nothing && (
          <Empty title="还没收到通知">
            <p>设定好 iPhone 之后，朋友用 TNG 转钱给你，这里就会出现。</p>
            <LinkButton href="/settings/tng-setup" variant="tinted" className="mt-5">
              去设定 iPhone
            </LinkButton>
          </Empty>
        )}

        {pending.length > 0 && (
          <section className="mt-8">
            <h2 className="label-mono mb-2.5 px-1 text-label-2">待确认（{pending.length}）</h2>
            <div className="space-y-3">
              {pending.map((p) => (
                <PendingCard
                  key={p.id}
                  p={p}
                  busy={busy}
                  onAssign={assign}
                  onIgnore={ignore}
                  onPick={() => setPick({ id: p.id, amountCents: p.amountCents, senderName: p.senderName })}
                />
              ))}
            </div>
          </section>
        )}

        {recorded.length > 0 && (
          <Group title="已记录（30 天内）">
            {recorded.map((r) => (
              <Row
                key={r.id}
                leading={<Avatar name={r.personName} />}
                trailing={
                  <button
                    type="button"
                    onClick={() => undo(r.id)}
                    disabled={busy === `undo:${r.id}`}
                    className="press label-mono inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-label-2 active:bg-fill disabled:opacity-40"
                  >
                    <Undo2 className="size-3.5" strokeWidth={2.25} aria-hidden /> 撤销
                  </button>
                }
              >
                <p className="truncate text-[16px] leading-[21px] font-semibold">
                  {r.personName} <Money cents={r.amountCents} />
                </p>
                <p className="mt-0.5 text-[13px] leading-[18px] text-label-2">
                  {formatWhen(r.receivedAt)} · {r.auto ? "自动记录" : "你确认的"}
                </p>
                {r.verdict && (
                  <div className="mt-1.5">
                    <Tag tone={r.verdictKind === "forgot_tax" ? "flare" : r.verdictKind === "settles_all" ? "forest" : "mist"}>
                      {r.verdictKind === "forgot_tax" ? "少给 tax" : r.verdictKind === "settles_all" ? "还清 ✓" : shortVerdict(r.verdict)}
                    </Tag>
                  </div>
                )}
              </Row>
            ))}
          </Group>
        )}

        {others.length > 0 && (
          <details className="group mt-8">
            <summary className="label-mono flex cursor-pointer list-none items-center justify-between px-1 text-label-2">
              <span>其他 TNG 通知（{others.length}）</span>
              <span className="group-open:hidden">看</span>
              <span className="hidden group-open:inline">收起</span>
            </summary>
            <p className="mt-2 px-1 text-[12px] leading-[17px] text-label-2">
              你付钱出去、cashback、广告、看不到金额的通知，不会记账。60 天后自动删掉。
            </p>
            <div className="card list mt-2.5 overflow-hidden rounded-[24px] bg-surface">
              {others.map((o) => (
                <Row
                  key={o.id}
                  trailing={
                    o.amountCents && o.status === "ignored" && o.direction !== "out" ? (
                      <Button size="sm" onClick={() => setPick({ id: o.id, amountCents: o.amountCents, senderName: null })}>
                        是朋友
                      </Button>
                    ) : undefined
                  }
                >
                  <p className="line-clamp-2 text-[14px] leading-5 break-words">{o.rawText}</p>
                  <p className="mt-1 text-[12px] leading-4 text-label-2">
                    {formatWhen(o.receivedAt)} · {otherLabel(o)}
                  </p>
                </Row>
              ))}
            </div>
          </details>
        )}
        <div className="h-6" />
      </div>

      <PickSheet
        pick={pick}
        people={people}
        busy={busy}
        onClose={() => setPick(null)}
        onPick={(personId) => pick && assign(pick.id, personId)}
      />
    </main>
  );
}

function shortVerdict(v: string): string {
  return v.length > 22 ? `${v.slice(0, 21)}…` : v;
}

function otherLabel(o: OtherV): string {
  if (o.status === "unparsed") return "看不到金额";
  if (o.direction === "out") return "你付钱出去";
  if (o.direction === "other") return "不是转账";
  return "你按了不记";
}

function PendingCard({
  p,
  busy,
  onAssign,
  onIgnore,
  onPick,
}: {
  p: PendingV;
  busy: string | null;
  onAssign: (id: string, personId: string, amountCents?: number) => void;
  onIgnore: (id: string) => void;
  onPick: () => void;
}) {
  const amount = p.amountCents ?? 0;
  const who = p.person;
  let headline: string;
  if (who && p.reason === "overpay") headline = `${who.name} 转了 ${formatRM(amount)}，但他只欠你 ${formatRM(who.owed)}。`;
  else if (who && p.reason === "no_debt") headline = `${who.name} 转了 ${formatRM(amount)}，但他目前没有欠你钱。`;
  else if (who && p.reason === "unsure") headline = `看起来是 ${who.name} 转来的，对吗？`;
  else if (p.reason === "undone") headline = "撤销了。是哪个朋友转的？";
  else if (p.senderName) headline = `TNG 显示「${p.senderName}」，是哪个朋友？`;
  else headline = "看不到是谁转的，是哪个朋友？";

  const isBusy = (k: string) => busy === k;
  const assignKey = (personId: string, cents?: number) => `assign:${p.id}:${personId}:${cents ?? ""}`;

  return (
    <article className="card rounded-[24px] bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <BigMoney cents={amount} className="text-[36px] leading-none" />
        <span className="label-mono pt-1 text-label-2">{formatWhen(p.receivedAt)}</span>
      </div>
      <p className="mt-3 text-[16px] leading-[22px] font-semibold">{headline}</p>
      <p className="mt-1.5 line-clamp-3 text-[13px] leading-[18px] break-words text-label-2">「{p.rawText}」</p>

      {who && p.reason === "overpay" ? (
        <div className="mt-4 grid gap-2">
          <Button variant="filled" full loading={isBusy(assignKey(who.id, who.owed))} onClick={() => onAssign(p.id, who.id, who.owed)}>
            只记 {formatRM(who.owed)}（刚好还清）
          </Button>
          <Button variant="gray" full loading={isBusy(assignKey(who.id))} onClick={() => onAssign(p.id, who.id)}>
            全部记 {formatRM(amount)}（多的下次扣）
          </Button>
        </div>
      ) : who && p.reason === "no_debt" ? (
        <div className="mt-4 grid gap-2">
          <Button variant="tinted" full loading={isBusy(`ignore:${p.id}`)} onClick={() => onIgnore(p.id)}>
            不是还钱，不记
          </Button>
          <Button variant="gray" full loading={isBusy(assignKey(who.id))} onClick={() => onAssign(p.id, who.id)}>
            记成 credit（下次自动扣）
          </Button>
        </div>
      ) : who && p.reason === "unsure" ? (
        <div className="mt-4 grid gap-2">
          <Button variant="filled" full loading={isBusy(assignKey(who.id))} onClick={() => onAssign(p.id, who.id)}>
            对，是 {who.name} 还钱
          </Button>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {p.suggestions.map((s) => (
            <button
              key={s.id}
              type="button"
              disabled={!!busy}
              onClick={() => onAssign(p.id, s.id)}
              className={cx(
                "press flex min-h-12 items-center gap-2.5 rounded-full py-1.5 pr-4 pl-1.5 text-left transition-colors disabled:opacity-50",
                s.hint === "金额刚好" || s.hint === "像是忘了 tax" ? "bg-volt text-ink" : "bg-fill active:bg-fill-2",
              )}
            >
              <Avatar name={s.name} size={34} />
              <span className="min-w-0">
                <span className="block truncate text-[15px] leading-5 font-semibold">{s.name}</span>
                <span className="block text-[11px] leading-4 opacity-75">
                  {s.hint ?? (s.owed > 0 ? `欠 ${formatRM(s.owed)}` : "没有欠")}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <Button variant="plain" size="sm" onClick={onPick} disabled={!!busy}>
          {who || p.suggestions.length > 0 ? "其实是别人" : "选是谁"}
        </Button>
        {!(who && p.reason === "no_debt") && (
          <Button variant="plain" size="sm" loading={isBusy(`ignore:${p.id}`)} onClick={() => onIgnore(p.id)}>
            <BellOff className="size-3.5" strokeWidth={2.25} aria-hidden /> 不是还钱，不记
          </Button>
        )}
      </div>
      {p.senderName && !who && (
        <p className="mt-2 px-1 text-[12px] leading-[17px] text-label-2">选了之后，下次「{p.senderName}」转钱就会自动记。</p>
      )}
    </article>
  );
}

function PickSheet({
  pick,
  people,
  busy,
  onClose,
  onPick,
}: {
  pick: Pick | null;
  people: PersonOpt[];
  busy: string | null;
  onClose: () => void;
  onPick: (personId: string) => void;
}) {
  return (
    <Sheet open={!!pick} onClose={onClose} title={pick?.amountCents ? `${formatRM(pick.amountCents)} 是谁转的？` : "是谁转的？"}>
      {people.length === 0 ? (
        <p className="py-6 text-center text-[15px] text-label-2">还没有朋友。先到「朋友」加人。</p>
      ) : (
        <div className="card list -mx-1 overflow-hidden rounded-[24px] bg-surface">
          {people.map((p) => (
            <Row
              key={p.id}
              onClick={() => (busy ? undefined : onPick(p.id))}
              leading={<Avatar name={p.name} />}
              trailing={p.owed > 0 ? <Money cents={p.owed} className="text-[15px] text-label-2" /> : undefined}
            >
              <span className="text-[16px] font-semibold">{p.name}</span>
            </Row>
          ))}
        </div>
      )}
      <p className="mt-3 px-1 text-[12px] leading-[17px] text-label-2">右边是他目前欠你的钱。</p>
    </Sheet>
  );
}
