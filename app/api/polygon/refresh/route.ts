import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { runPriceSync } from "@/lib/polygon/sync";
import type { Database } from "@/lib/db/types";

// On-demand price refresh — ignores the polling interval.
// Used by the Phase 5 real-time dashboard when the user triggers a manual refresh.
export async function POST() {
  const cookieStore = cookies();
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  try {
    const result = await runPriceSync(user.id);

    // Update the sync timestamp so SyncIndicator reflects the refresh
    await admin
      .from("BrokerConnection")
      .update({
        lastPriceSyncAt: new Date().toISOString(),
        lastPriceSyncStatus: result.status,
      })
      .eq("userId", user.id);

    return NextResponse.json({ ok: true, updated: result.updated, tickers: result.tickers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/polygon/refresh] Error:", message);

    await admin
      .from("BrokerConnection")
      .update({ lastPriceSyncAt: new Date().toISOString(), lastPriceSyncStatus: "ERROR" })
      .eq("userId", user.id);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
