import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/db/types";

// Returns current BrokerConnection status — never returns the encrypted token
export async function GET() {
  const cookieStore = cookies();
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("BrokerConnection")
    .select(
      "id, flexQueryIdTrades, flexQueryIdActivity, pollingIntervalMin, pricePollingIntervalMin, lastSyncAt, lastSyncStatus, lastSyncError, lastBackfillAt, lastBackfillStatus, lastBackfillError, lastPriceSyncAt, lastPriceSyncStatus, isActive, accountId"
    )
    .eq("userId", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to load connection" }, { status: 500 });
  }

  return NextResponse.json({ connection: data });
}
