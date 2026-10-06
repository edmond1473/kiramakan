import { cookies } from "next/headers";
import { handle } from "@/lib/server/api";
import { SESSION_COOKIE } from "@/lib/server/auth";

export async function POST() {
  return handle(async () => {
    (await cookies()).delete(SESSION_COOKIE);
    return { ok: true };
  });
}
