import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken } from "@/lib/ibkr/encrypt";
import { fetchFlexQuery } from "@/lib/ibkr/flex-client";
import { parseActivityXml } from "@/lib/ibkr/parse-flex-xml";
import { executionsToCsv } from "@/lib/ibkr/xml-to-csv";
import type { Database } from "@/lib/db/types";

// Returns the latest Activity Flex data as a downloadable CSV.
// Fetches fresh data from IBKR (same query used for backfill/sync).
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
  const { data: conn } = await admin
    .from("BrokerConnection")
    .select("flexTokenEncrypted, flexQueryIdActivity")
    .eq("userId", user.id)
    .maybeSingle();

  if (!conn) {
    return NextResponse.json({ error: "No IBKR connection configured" }, { status: 404 });
  }

  let token: string;
  try {
    token = decryptToken(conn.flexTokenEncrypted);
  } catch {
    return NextResponse.json({ error: "Failed to decrypt token" }, { status: 500 });
  }

  let xml: string;
  try {
    xml = await fetchFlexQuery(token, conn.flexQueryIdActivity);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `IBKR fetch failed: ${msg}` }, { status: 502 });
  }

  const executions = parseActivityXml(xml);
  const csv = executionsToCsv(executions);

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="activity_${date}.csv"`,
    },
  });
}
