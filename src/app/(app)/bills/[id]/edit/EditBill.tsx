"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BillView } from "@/lib/server/world";
import { api } from "@/lib/client/api";
import { draftFromParts, parseDraft, type Draft } from "@/lib/receipt";
import { ItemsEditor } from "@/components/ItemsEditor";
import { Button, Group, Notice, PageHeader } from "@/components/ui";
import { selectClass, toast } from "@/components/ui-client";

export function EditBill({ view, people }: { view: BillView; people: { id: string; name: string; isPayer: boolean }[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() =>
    draftFromParts({
      title: view.title,
      date: view.billDate,
      items: view.items.map((i) => ({ id: i.id, name: i.name, qty: i.qty, lineCents: i.lineCents })),
      charges: view.charges,
      totalCents: view.totalCents,
      printedSubtotalCents: view.printedSubtotalCents,
    }),
  );
  const [payerId, setPayerId] = useState(view.payer.personId);
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const parsed = parseDraft(draft);

  async function save() {
    if (parsed.errors.length) {
      setShowErrors(true);
      toast(parsed.balanceError ? "加起来跟总额对不上，先修正才能保存" : parsed.errors[0], "error");
      return;
    }
    setSaving(true);
    try {
      await api(`/api/bills/${view.id}/items`, {
        method: "PUT",
        body: { items: parsed.items, charges: parsed.charges, totalCents: parsed.totalCents },
      });
      await api(`/api/bills/${view.id}`, {
        method: "PATCH",
        body: { title: draft.title.trim(), billDate: draft.date, payerPersonId: payerId },
      });
      toast("已更新");
      router.push(`/bills/${view.id}`);
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "存不到", "error");
      setSaving(false);
    }
  }

  return (
    <main>
      <PageHeader title="修改账单" back={{ href: `/bills/${view.id}`, label: "返回" }} />
      <div className="px-4 pb-8">
        <ItemsEditor draft={draft} onChange={setDraft} />
        <Group title="谁付了餐厅">
          <div className="p-4">
            <select aria-label="谁付了餐厅" value={payerId} onChange={(e) => setPayerId(e.target.value)} className={selectClass("w-full")}>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </div>
        </Group>
        {showErrors && parsed.errors.length > 0 && (
          <div className="mt-4 space-y-2">
            {parsed.errors.filter((e) => e !== parsed.balanceError).map((e) => (
              <Notice key={e} tone="error">
                {e}
              </Notice>
            ))}
          </div>
        )}
        <p className="mt-4 px-1 text-[12px] leading-[17px] text-label-2">删掉的 item，原本谁认领的也会一起删掉。其他 item 的认领会保留。</p>
        <div className="mt-6">
          <Button variant="filled" size="lg" full loading={saving} onClick={save}>
            保存修改
          </Button>
        </div>
      </div>
    </main>
  );
}
