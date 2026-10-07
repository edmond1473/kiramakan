"use client";

import { useEffect } from "react";
import { syncPush } from "@/lib/client/push";

/** 开 app 时（一天一次）把这部手机的通知订阅再告诉 server，避免订阅过期了还不知道 */
export function PushSync() {
  useEffect(() => {
    syncPush().catch(() => {});
  }, []);
  return null;
}
