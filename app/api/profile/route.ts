import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { TablesUpdate, Json } from "@/lib/db/types";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // RLS policy `auth.uid() = "id"` restricts this read to the caller's own row.
  const { data, error } = await supabase
    .from("User")
    .select("id, email, name, firstName, lastName, phone, addressStreet, addressCity, addressCountry, settings")
    .eq("id", user.id)
    .single();

  if (error) return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
  return NextResponse.json({ user: data });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
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

  // Build column-level update for profile fields
  const profileUpdate: TablesUpdate<"User"> = {};
  if (body.name !== undefined)          profileUpdate.name          = body.name;
  if (body.firstName !== undefined)     profileUpdate.firstName     = body.firstName || null;
  if (body.lastName !== undefined)      profileUpdate.lastName      = body.lastName  || null;
  if (body.phone !== undefined)         profileUpdate.phone         = body.phone     || null;
  if (body.addressStreet !== undefined) profileUpdate.addressStreet = body.addressStreet || null;
  if (body.addressCity !== undefined)   profileUpdate.addressCity   = body.addressCity   || null;
  if (body.addressCountry !== undefined) profileUpdate.addressCountry = body.addressCountry || null;

  // Merge display prefs into settings JSON — read-then-write through RLS for own row
  if (body.settings?.display) {
    const { data: existing } = await supabase
      .from("User")
      .select("settings")
      .eq("id", user.id)
      .single();

    const existingSettings = (existing?.settings as Record<string, unknown>) ?? {};
    const existingDisplay  = (existingSettings.display as Record<string, unknown>) ?? {};
    profileUpdate.settings = {
      ...existingSettings,
      display: { ...existingDisplay, ...body.settings.display },
    } as Json;
  }

  // Ensure the User row exists for fresh signups that have not visited /research yet.
  // Upsert via RLS: auth.uid() = id permits inserting own row.
  await supabase.from("User").upsert(
    { id: user.id, email: user.email! },
    { onConflict: "id", ignoreDuplicates: true }
  );

  if (Object.keys(profileUpdate).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase.from("User").update(profileUpdate).eq("id", user.id);
  if (error) return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
