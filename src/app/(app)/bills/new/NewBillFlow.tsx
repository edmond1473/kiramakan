"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, ImageUp, PencilLine } from "lucide-react";
import { api, ApiError } from "@/lib/client/api";
import { compressImage } from "@/lib/client/image";
import { centsToPlain } from "@/lib/money";
import { draftFromParts, newKey, parseDraft, type Draft } from "@/lib/receipt";
import type { CrossCheck, ProviderOutcome, ReadItem } from "@/lib/receipt-compare";
import { CrossCheckBanner } from "@/components/CrossCheckBanner";
import { ItemsEditor } from "@/components/ItemsEditor";
import { PeoplePicker } from "@/components/PeoplePicker";
import { Button, Group, Notice, PageHeader, Row, Spinner } from "@/components/ui";
import { toast } from "@/components/ui-client";

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
}

type Step = "photo" | "reading" | "review" | "people";

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
      const r = await api<ReceiptDraftResponse>("/api/receipt/read", { body: { image: dataUrl } });
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : "读不到 receipt";
      if (e instanceof ApiError && e.status === 503) {
        toast(msg, "error");
        setOcr(null);
        setExtraItems([]);
        setDraft(emptyDraft(today));
        setStep("review");
      } else {
        setReadError(`${msg}。可以再拍一次，或手动输入。`);
        setStep("photo");
      }
    }
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
              <div className="mt-6 flex flex-col items-center rounded-xl bg-surface px-6 py-10 text-center">
                {image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={image} alt="receipt" className="mb-5 max-h-56 rounded-lg object-contain" />
                )}
                <Spinner className="size-6 text-tint" />
                <p className="mt-3 text-[17px] leading-6 font-semibold">正在读 receipt…</p>
                <p className="mt-1 text-[13px] leading-[18px] text-label-2">大概 10–20 秒</p>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => cameraRef.current?.click()}
                  className="press mt-6 flex w-full flex-col items-center rounded-xl border-2 border-dashed border-separator bg-surface px-6 py-12 text-center active:bg-fill"
                >
                  <Camera className="size-10 text-tint" strokeWidth={1.5} aria-hidden />
                  <span className="mt-3 text-[17px] leading-6 font-semibold">拍 receipt</span>
                  <span className="mt-1 text-[13px] leading-[18px] text-label-2">平放、光线够、整张入镜</span>
                </button>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Button onClick={() => galleryRef.current?.click()}>
                    <ImageUp className="size-[18px]" strokeWidth={1.75} /> 从相册选
                  </Button>
                  <Button
                    onClick={() => {
                      setOcr(null);
                      setExtraItems([]);
                      setDraft(emptyDraft(today));
                      setStep("review");
                    }}
                  >
                    <PencilLine className="size-[18px]" strokeWidth={1.75} /> 手动输入
                  </Button>
                </div>
                {readError && (
                  <div className="mt-4">
                    <Notice tone="error">{readError}</Notice>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      ) : step === "review" ? (
        <>
          <PageHeader title="核对 receipt" subtitle="AI 读的可能会错，对一下 item 和总额。" />
          <div className="px-4 pb-6">
            {image && (
              <details className="mt-4 rounded-xl bg-surface px-4 py-3">
                <summary className="cursor-pointer text-[15px] font-medium text-tint-text">看 receipt 照片</summary>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image} alt="receipt" className="mt-3 w-full rounded-lg" />
              </details>
            )}
            {ocr && (
              <CrossCheckBanner
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
            <div className="mt-6 grid grid-cols-[auto_1fr] gap-3">
              <Button onClick={() => setStep("photo")}>重拍</Button>
              <Button variant="filled" onClick={goPeople}>
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
                  trailing={payerId === p.id ? <Check className="size-5 text-tint" strokeWidth={2.5} /> : null}
                >
                  <span className="text-[15px]">{p.id === me.personId ? `我（${p.name}）` : p.name}</span>
                </Row>
              ))}
              {people.some((p) => !payers.includes(p)) && (
                <div className="row px-4">
                  <div className="row-sep flex min-h-[44px] items-center gap-3 border-b border-separator py-2">
                    <span className="flex-1 text-[15px] text-label-2">别的朋友付的</span>
                    <select
                      aria-label="别的朋友付的"
                      value={payers.some((p) => p.id === payerId) ? "" : payerId}
                      onChange={(e) => {
                        if (!e.target.value) return;
                        setPayerId(e.target.value);
                        setSelected((s) => new Set([...s, e.target.value]));
                      }}
                      className="h-9 rounded-lg bg-fill px-2 text-[15px]"
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

            <section className="mt-6">
              <h2 className="mb-2 px-4 text-[13px] leading-[18px] font-medium text-label-2">谁有一起吃（点名字选）</h2>
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
              <p className="mt-2 px-1 text-[12px] leading-4 text-label-2">
                漏了也没关系，朋友开 link 时可以自己加名字。
              </p>
            </section>

            <div className="mt-6 grid grid-cols-[auto_1fr] gap-3">
              <Button onClick={() => setStep("review")}>上一步</Button>
              <Button variant="filled" loading={saving} onClick={save}>
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
