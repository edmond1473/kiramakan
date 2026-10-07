"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { Button, Notice } from "./ui";
import { Field } from "./ui-client";

export function AuthForm({ mode }: { mode: "login" | "setup" }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "setup") await api("/api/setup", { body: { name, username, password } });
      else await api("/api/auth/login", { body: { username, password } });
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "出错了");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {mode === "setup" && (
        <Field label="你的名字（朋友看到的）" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如 Jusbie" required />
      )}
      <Field
        label="登入名"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="username"
        placeholder="英文字母或数字"
        required
      />
      <Field
        label="密码"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete={mode === "setup" ? "new-password" : "current-password"}
        hint={mode === "setup" ? "最少 6 个字" : undefined}
        required
      />
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" variant="tinted" size="lg" full loading={busy}>
        {mode === "setup" ? "建立帐号" : "登入"}
      </Button>
    </form>
  );
}
