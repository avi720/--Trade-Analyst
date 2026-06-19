import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Returns current BrokerConnection status — never returns the encrypted token.
// Uses the RLS-bound client: BrokerConnection RLS limits rows to auth.uid() = userId.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("BrokerConnection")
    .select(
      "id, flexQueryIdActivity, pricePollingIntervalMin, lastSyncAt, lastSyncStatus, lastSyncError, lastPriceSyncAt, lastPriceSyncStatus, isActive, accountId"
    )
    .eq("userId", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to load connection" }, { status: 500 });
  }

  return NextResponse.json({ connection: data });
}
