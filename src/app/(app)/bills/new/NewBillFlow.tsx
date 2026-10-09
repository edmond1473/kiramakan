"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, ImageUp, Mic, PencilLine } from "lucide-react";
import { api, ApiError } from "@/lib/client/api";
import { compressImage } from "@/lib/client/image";
import { centsToPlain } from "@/lib/money";
import { draftFromParts, newKey, parseDraft, type Draft } from "@/lib/receipt";
import type { CrossCheck, ProviderOutcome, ReadItem } from "@/lib/receipt-compare";
import { CrossCheckBanner } from "@/components/CrossCheckBanner";
import { ItemsEditor } from "@/components/ItemsEditor";
import { PeoplePicker } from "@/components/PeoplePicker";
import { Button, Group, Notice, PageHeader, Row, Spinner } from "@/components/ui";
import { selectClass, toast } from "@/components/ui-client";
import { VoiceInput } from "./VoiceInput";

interface ReceiptDraftResponse {
  merchant: string | null;
  date: string | null;
  items: { name: string; qty: number; lineCents: number }[];
  charges: { label: string; amountCents: number }[];
  printedSubtotalCents: number | null;
  totalCents: number;
  notes: string | null;
  warnings: string[];
  crossCheck: CrossCheck;
  raw: { outcomes: ProviderOutcome[] };
  /** 用说的：AI 听到的内容 */
  transcript?: string | null;
}

type Step = "photo" | "reading" | "voice" | "review" | "people";

export function NewBillFlow({
  me,
  people: initialPeople,
  today,
}: {
  me: { personId: string; name: string };
  people: { id: string; name: string; isPayer: boolean }[];
  today: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("photo");
  const [image, setImage] = useState<string | null>(null);
  const [ocr, setOcr] = useState<ReceiptDraftResponse | null>(null);
  const [extraItems, setExtraItems] = useState<(ReadItem & { from: string })[]>([]);
  const [readError, setReadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(today));
  const [showErrors, setShowErrors] = useState(false);
  const people = initialPeople;
  const [payerId, setPayerId] = useState(me.personId);
  const [selected, setSelected] = useState<Set<string>>(new Set([me.personId]));
  const [newNames, setNewNames] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setReadError(null);
    setStep("reading");
    let dataUrl: string;
    try {
      dataUrl = await compressImage(file);
      setImage(dataUrl);
    } catch {
      setReadError("这张照片打不开，换一张试试，或手动输入。");
      setStep("photo");
      return;
    }
    try {
      applyRead(await api<ReceiptDraftResponse>("/api/receipt/read", { body: { image: dataUrl } }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "读不到 receipt";
      if (e instanceof ApiError && e.status === 503) {
        toast(msg, "error");
        setOcr(null);
        setExtraItems([]);
        setDraft(emptyDraft(today));
        setStep("review");
      } else {
        setReadError(`${msg}。可以再拍一次、手动输入，或到「设定」按「检查 AI」看原因。`);
        setStep("photo");
      }
    }
  }

  /** AI 读好（receipt 或用说的）：填进核对画面 */
  function applyRead(r: ReceiptDraftResponse) {
    setOcr(r);
    setExtraItems(r.crossCheck.extraItems);
    setDraft(
      draftFromParts({
        title: r.merchant ?? "",
        date: r.date ?? today,
        items: r.items,
        charges: r.charges,
        totalCents: r.totalCents,
        printedSubtotalCents: r.printedSubtotalCents,
        notes: r.crossCheck.itemNotes,
      }),
    );
    setStep("review");
    window.scrollTo({ top: 0 });
  }

  function goPeople() {
    const p = parseDraft(draft);
    if (p.errors.length) {
      setShowErrors(true);
      toast(p.balanceError ? "加起来跟总额对不上，先修正才能继续" : p.errors[0], "error");
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
      return;
    }
    setStep("people");
    window.scrollTo({ top: 0 });
  }

  async function save() {
    const p = parseDraft(draft);
    if (p.errors.length) return setStep("review");
    setSaving(true);
    try {
      const { id } = await api<{ id: string }>("/api/bills", {
        body: {
          title: draft.title.trim(),
          billDate: draft.date || today,
          payerPersonId: payerId,
          totalCents: p.totalCents,
          printedSubtotalCents: draft.printedSubtotalCents,
          items: p.items.map(({ name, qty, lineCents }) => ({ name, qty, lineCents })),
          charges: p.charges,
          participantIds: [...selected].filter((id) => !id.startsWith("new:")),
          image,
          ocrRaw: ocr ? { crossCheck: ocr.crossCheck, outcomes: ocr.raw.outcomes } : undefined,
        },
      });
      if (newNames.length) {
        await api(`/api/bills/${id}/participants`, { body: { personIds: [], names: newNames } });
      }
      router.push(`/bills/${id}?new=1`);
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "存不到", "error");
      setSaving(false);
    }
  }

  const parsed = parseDraft(draft);
  const payers = [
    ...people.filter((p) => p.id === me.personId),
    ...people.filter((p) => p.isPayer && p.id !== me.personId),
  ];

  return (
    <main>
      {step === "photo" || step === "reading" ? (
        <>
          <PageHeader title="新增一餐" back={{ href: "/", label: "账本" }} subtitle="拍下 receipt，系统会自动拆出每个 item。" />
          <div className="px-4">
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />

            {step === "reading" ? (
              <div className="grid-lines on-color mt-6 flex flex-col items-center rounded-[32px] px-6 py-10 text-center" aria-live="polite">
                {image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={image} alt="receipt" className="mb-6 max-h-56 rounded-[12px] object-contain ring-1 ring-black/10" />
                )}
                <Spinner className="size-7" />
                <p className="display mt-4 text-[30px]">正在读 receipt…</p>
                <p className="mt-2 text-[14px] leading-5">两个 AI 一起读、互相比对，大概 10–20 秒</p>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => cameraRef.current?.click()}
                  className="press grid-lines on-color mt-6 flex w-full flex-col items-center rounded-[32px] px-6 pt-12 pb-11 text-center"
                >
                  <span className="flex size-20 items-center justify-center rounded-full bg-ink text-volt">
                    <Camera className="size-9" strokeWidth={2} aria-hidden />
                  </span>
                  <span className="display mt-6 text-[36px]">拍 receipt</span>
                  <span className="mt-2 text-[14px] leading-5">平放、光线够、整张入镜</span>
                </button>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button full onClick={() => galleryRef.current?.click()}>
                    <ImageUp className="size-[18px]" strokeWidth={2} /> 从相册选
                  </Button>
                  <Button
                    full
                    onClick={() => {
                      setOcr(null);
                      setExtraItems([]);
                      setDraft(emptyDraft(today));
                      setStep("review");
                    }}
                  >
                    <PencilLine className="size-[18px]" strokeWidth={2} /> 手动输入
                  </Button>
                </div>
                <Button
                  full
                  className="mt-2"
                  onClick={() => {
                    setReadError(null);
                    setImage(null);
                    setStep("voice");
                  }}
                >
                  <Mic className="size-[18px]" strokeWidth={2} /> 没有 receipt？用说的
                </Button>
                {readError && (
                  <div className="mt-4">
                    <Notice tone="error">{readError}</Notice>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      ) : step === "voice" ? (
        <>
          <PageHeader title="用说的" subtitle="没有 receipt 的时候，讲出吃了什么、多少钱，AI 帮你整理。" />
          <VoiceInput<ReceiptDraftResponse> onResult={applyRead} onBack={() => setStep("photo")} />
        </>
      ) : step === "review" ? (
        <>
          <PageHeader
            title={ocr?.transcript !== undefined ? "核对一下" : "核对 receipt"}
            subtitle={ocr?.transcript !== undefined ? "AI 听的可能会错，对一下 item、价钱和总额。" : "AI 读的可能会错，对一下 item 和总额。"}
          />
          <div className="px-4 pb-6">
            {ocr?.transcript && (
              <div className="card mt-6 rounded-[24px] bg-surface px-5 py-4">
                <p className="label-mono text-label-2">AI 听到的</p>
                <p className="mt-2 text-[15px] leading-[22px]">「{ocr.transcript}」</p>
              </div>
            )}
            {image && (
              <details className="card mt-6 rounded-[24px] bg-surface px-5 py-4">
                <summary className="label-mono cursor-pointer text-label">看 receipt 照片</summary>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image} alt="receipt" className="mt-4 w-full rounded-[12px]" />
              </details>
            )}
            {ocr && (
              <CrossCheckBanner
                voice={ocr.transcript !== undefined}
                check={ocr.crossCheck}
                extraItems={extraItems}
                onAddExtra={(e) => {
                  setExtraItems((xs) => xs.filter((x) => x !== e));
                  setDraft((d) => ({
                    ...d,
                    items: [
                      ...d.items,
                      {
                        key: newKey(),
                        name: e.name,
                        qty: String(e.qty),
                        amount: centsToPlain(e.lineCents),
                        note: `只有 ${e.from} 读到这个`,
                      },
                    ],
                  }));
                }}
              />
            )}
            {ocr?.notes && (
              <div className="mt-4">
                <Notice tone="warn">AI 备注：{ocr.notes}</Notice>
              </div>
            )}
            <ItemsEditor draft={draft} onChange={setDraft} />
            {showErrors && parsed.errors.length > 0 && (
              <div className="mt-4 space-y-2">
                {parsed.errors.filter((e) => e !== parsed.balanceError).map((e) => (
                  <Notice key={e} tone="error">
                    {e}
                  </Notice>
                ))}
              </div>
            )}
            <div className="mt-8 grid grid-cols-[auto_1fr] gap-2">
              <Button size="lg" onClick={() => setStep("photo")}>
                重拍
              </Button>
              <Button variant="filled" size="lg" onClick={goPeople}>
                下一步：谁有吃
              </Button>
            </div>
          </div>
        </>
      ) : (
        <>
          <PageHeader title="谁付的、谁有吃" subtitle={`${draft.title} · RM ${parsed.totalCents ? (parsed.totalCents / 100).toFixed(2) : "0.00"}`} />
          <div className="px-4 pb-6">
            <Group title="谁付了餐厅">
              {payers.map((p) => (
                <Row
                  key={p.id}
                  onClick={() => {
                    setPayerId(p.id);
                    setSelected((s) => new Set([...s, p.id]));
                  }}
                  trailing={
                    payerId === p.id ? (
                      <span className="flex size-[26px] items-center justify-center rounded-full bg-contrast text-on-contrast">
                        <Check className="size-4" strokeWidth={3.5} aria-label="已选" />
                      </span>
                    ) : (
                      <span className="block size-[26px] rounded-full border-2 border-label-3" />
                    )
                  }
                >
                  <span className="text-[16px] font-semibold">{p.id === me.personId ? `我（${p.name}）` : p.name}</span>
                </Row>
              ))}
              {people.some((p) => !payers.includes(p)) && (
                <div className="row px-4">
                  <div className="row-sep flex min-h-[60px] items-center gap-3 border-b border-separator py-2.5 pr-4">
                    <span className="min-w-0 flex-1 text-[16px] whitespace-nowrap text-label-2">别的朋友付的</span>
                    <select
                      aria-label="别的朋友付的"
                      value={payers.some((p) => p.id === payerId) ? "" : payerId}
                      onChange={(e) => {
                        if (!e.target.value) return;
                        setPayerId(e.target.value);
                        setSelected((s) => new Set([...s, e.target.value]));
                      }}
                      className={selectClass("h-11 w-36 shrink-0 text-[15px]")}
                    >
                      <option value="">选…</option>
                      {people
                        .filter((p) => !payers.includes(p))
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              )}
            </Group>

            <section className="mt-8">
              <h2 className="label-mono mb-2.5 px-1 text-label-2">谁有一起吃（点名字选）</h2>
              <PeoplePicker
                people={[...people, ...newNames.map((n) => ({ id: `new:${n}`, name: n }))]}
                selected={new Set([...selected, ...newNames.map((n) => `new:${n}`)])}
                locked={new Set([payerId])}
                onToggle={(id) => {
                  if (id.startsWith("new:")) {
                    setNewNames((xs) => xs.filter((x) => `new:${x}` !== id));
                    return;
                  }
                  setSelected((s) => {
                    const n = new Set(s);
                    if (n.has(id)) n.delete(id);
                    else n.add(id);
                    return n;
                  });
                }}
                onAddName={(n) => {
                  const existing = people.find((p) => p.name.toLowerCase() === n.toLowerCase());
                  if (existing) {
                    setSelected((s) => new Set([...s, existing.id]));
                    return;
                  }
                  if (!newNames.some((x) => x.toLowerCase() === n.toLowerCase())) setNewNames((xs) => [...xs, n]);
                }}
              />
              <p className="mt-2.5 px-1 text-[12px] leading-[17px] text-label-2">漏了也没关系，朋友开 link 时可以自己加名字。</p>
            </section>

            <div className="mt-8 grid grid-cols-[auto_1fr] gap-2">
              <Button size="lg" onClick={() => setStep("review")}>
                上一步
              </Button>
              <Button variant="filled" size="lg" loading={saving} onClick={save}>
                建立账单
              </Button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}

function emptyDraft(today: string): Draft {
  return {
    title: "",
    date: today,
    items: [{ key: newKey(), name: "", qty: "1", amount: "" }],
    charges: [],
    total: "",
    printedSubtotalCents: null,
  };
}
