import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ProfileLayout } from "@/components/profile/profile-layout";
import type { SubscriptionTier } from "@/lib/billing/tier";
import { isLaunchPromoActive } from "@/lib/billing/prices";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: userRow } = await admin
    .from("User")
    .select("name, firstName, lastName, phone, addressStreet, addressCity, addressCountry, settings, subscriptionTier, subscriptionStatus, subscriptionRenewsAt")
    .eq("id", user.id)
    .single();

  const tier: SubscriptionTier = userRow?.subscriptionTier === "Pro" ? "Pro" : "Free";

  const display = ((userRow?.settings as Record<string, unknown>)?.display ?? {}) as {
    currency?: "USD" | "ILS";
    dateFormat?: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
    numberFormat?: "en" | "eu";
    timezone?: string;
  };

  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center text-text-dim text-sm">טוען...</div>}>
      <ProfileLayout
        userEmail={user.email ?? ""}
        userName={userRow?.name ?? null}
        userProfile={{
          firstName: userRow?.firstName ?? null,
          lastName: userRow?.lastName ?? null,
          phone: userRow?.phone ?? null,
          addressStreet: userRow?.addressStreet ?? null,
          addressCity: userRow?.addressCity ?? null,
          addressCountry: userRow?.addressCountry ?? null,
        }}
        userDisplay={display}
        userTier={tier}
        subscriptionStatus={userRow?.subscriptionStatus ?? null}
        subscriptionRenewsAt={userRow?.subscriptionRenewsAt ?? null}
        isLaunchPromo={isLaunchPromoActive()}
      />
    </Suspense>
  );
}
