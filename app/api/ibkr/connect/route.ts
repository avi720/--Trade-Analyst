import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptToken } from "@/lib/ibkr/encrypt";
import type { Database } from "@/lib/db/types";

const schema = z.object({
  flexToken: z.string().min(1, "Flex token is required"),
  flexQueryIdActivity: z.string().min(1, "Activity query ID is required"),
  pollingIntervalMin: z.number().int().min(1, "Polling interval must be at least 1 minute"),
});

export async function POST(req: NextRequest) {
  // Auth check
  const cookieStore = cookies();
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { flexToken, flexQueryIdActivity, pollingIntervalMin } = parsed.data;

  let flexTokenEncrypted: string;
  try {
    flexTokenEncrypted = encryptToken(flexToken);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Encryption failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("BrokerConnection").upsert(
    {
      userId: user.id,
      brokerName: "IBKR_FLEX",
      flexTokenEncrypted,
      flexQueryIdActivity,
      pollingIntervalMin,
      isActive: true,
    },
    { onConflict: "userId" }
  );

  if (error) {
    console.error("[api/ibkr/connect] DB error:", error.message);
    return NextResponse.json({ error: "Failed to save connection" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
