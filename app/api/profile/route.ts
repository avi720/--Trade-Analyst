import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/db/types";

function createAnonClient() {
  const cookieStore = cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
}

export async function GET() {
  const supabase = createAnonClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("User")
    .select("id, email, name, firstName, lastName, phone, addressStreet, addressCity, addressCountry, settings")
    .eq("id", user.id)
    .single();

  if (error) return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
  return NextResponse.json({ user: data });
}

export async function PATCH(req: NextRequest) {
  const supabase = createAnonClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    name?: string | null;
    firstName?: string;
    lastName?: string;
    phone?: string;
    addressStreet?: string;
    addressCity?: string;
    addressCountry?: string;
    settings?: { display?: Record<string, unknown> };
  };

  const admin = createAdminClient();

  // Build column-level update for profile fields
  const profileUpdate: Record<string, unknown> = {};
  if (body.name !== undefined)          profileUpdate.name          = body.name;
  if (body.firstName !== undefined)     profileUpdate.firstName     = body.firstName || null;
  if (body.lastName !== undefined)      profileUpdate.lastName      = body.lastName  || null;
  if (body.phone !== undefined)         profileUpdate.phone         = body.phone     || null;
  if (body.addressStreet !== undefined) profileUpdate.addressStreet = body.addressStreet || null;
  if (body.addressCity !== undefined)   profileUpdate.addressCity   = body.addressCity   || null;
  if (body.addressCountry !== undefined) profileUpdate.addressCountry = body.addressCountry || null;

  // Merge display prefs into settings JSON
  if (body.settings?.display) {
    const { data: existing } = await admin
      .from("User")
      .select("settings")
      .eq("id", user.id)
      .single();

    const existingSettings = (existing?.settings as Record<string, unknown>) ?? {};
    const existingDisplay  = (existingSettings.display as Record<string, unknown>) ?? {};
    profileUpdate.settings = {
      ...existingSettings,
      display: { ...existingDisplay, ...body.settings.display },
    };
  }

  if (Object.keys(profileUpdate).length === 0) {
    return NextResponse.json({ ok: true });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await admin.from("User").update(profileUpdate as any).eq("id", user.id);
  if (error) return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
