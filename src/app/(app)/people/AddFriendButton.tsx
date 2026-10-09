"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { api } from "@/lib/client/api";
import { Button } from "@/components/ui";
import { Field, Sheet, toast } from "@/components/ui-client";

export function AddFriendButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [tngName, setTngName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, startTransition] = useTransition();

  async function save() {
    setBusy(true);
    try {
      await api("/api/people", { body: { name, tngName: tngName || null, phone: phone || null } });
      toast(`已加 ${name}`);
      // 朋友列表更新好了才一起关掉：关的那一刻新朋友已经在列表上
      startTransition(() => {
        setOpen(false);
        setName("");
        setTngName("");
        setPhone("");
        router.refresh();
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : "存不到", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="filled" size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="size-4" strokeWidth={2.25} /> 加朋友
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="加朋友"
        footer={
          <Button variant="filled" size="lg" full loading={busy || refreshing} disabled={!name.trim()} onClick={save}>
            保存
          </Button>
        }
      >
        <div className="space-y-5">
          <Field label="名字（大家叫他的名字）" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如 Ali" autoFocus />
          <Field
            label="TNG 名字（可以不填）"
            value={tngName}
            onChange={(e) => setTngName(e.target.value)}
            placeholder="例如 ALI BIN ABU"
            hint="他转钱给你时 TNG 显示的名字，之后自动对账用。"
          />
          <Field label="电话（可以不填）" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="012-345 6789" />
        </div>
      </Sheet>
    </>
  );
}
