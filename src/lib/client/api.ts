"use client";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** keepalive：马上要跳去别的 app（例如 TNG）也会送到 */
export async function api<T = unknown>(url: string, init?: { method?: string; body?: unknown; keepalive?: boolean }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init?.method ?? (init?.body !== undefined ? "POST" : "GET"),
      headers: init?.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      keepalive: init?.keepalive,
    });
  } catch {
    throw new ApiError(0, "连不上网络，请再试一次");
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // 没有 JSON body
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error ?? `出错了（${res.status}）`;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}
