import { z } from "zod";
import { body, handle, zName } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { createPerson } from "@/lib/server/mutations";
import { loadWorld } from "@/lib/server/world";

export const dynamic = "force-dynamic";

const Create = z.object({
  name: zName,
  tngName: z.string().trim().max(80).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
});

export async function GET() {
  return handle(async () => {
    await requireUser();
    const w = await loadWorld();
    return [...w.people.values()]
      .filter((p) => p.isActive)
      .map((p) => ({ id: p.id, name: p.name, tngName: p.tngName, phone: p.phone, isPayer: !!p.userId }));
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    await requireUser();
    const id = await createPerson(await body(req, Create));
    return { id };
  });
}
