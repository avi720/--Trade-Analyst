// PARKED — Massive polling-interval settings. See lib/massive/client.ts header.
// The corresponding settings panel was hidden from app/(dashboard)/settings/page.tsx;
// route remains mounted for the planned re-enable.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  pricePollingIntervalMin: z
    .number()
    .int()
    .min(15, "Price polling interval must be at least 15 minutes"),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  // RLS on BrokerConnection limits the UPDATE to the caller's own row.
  const { error } = await supabase
    .from("BrokerConnection")
    .update({ pricePollingIntervalMin: parsed.data.pricePollingIntervalMin })
    .eq("userId", user.id);

  if (error) {
    console.error("[api/massive/settings] DB error:", error.message);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
