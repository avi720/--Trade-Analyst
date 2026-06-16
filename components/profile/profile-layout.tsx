"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { User, Shield, Monitor, Plug } from "lucide-react";
import { TabAccount } from "./tab-account";
import { TabSecurity } from "./tab-security";
import { TabDisplay } from "./tab-display";
import { TabBroker } from "./tab-broker";
import { cn } from "@/lib/utils/cn";

interface UserProfile {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  addressStreet: string | null;
  addressCity: string | null;
  addressCountry: string | null;
}

interface UserDisplay {
  currency?: "USD" | "ILS";
  dateFormat?: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
  numberFormat?: "en" | "eu";
}

interface ProfileLayoutProps {
  userEmail: string;
  userName: string | null;
  userProfile: UserProfile;
  userDisplay: UserDisplay;
}

const TABS = [
  { id: "account", label: "חשבון", icon: User },
  { id: "security", label: "אבטחה", icon: Shield },
  { id: "display", label: "תצוגה", icon: Monitor },
  { id: "broker", label: "ברוקר", icon: Plug },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function ProfileLayout({ userEmail, userName, userProfile, userDisplay }: ProfileLayoutProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const rawTab = searchParams.get("tab");
  const activeTab: TabId = TABS.some((t) => t.id === rawTab)
    ? (rawTab as TabId)
    : "account";

  function goToTab(id: TabId) {
    router.push(`/profile?tab=${id}`);
  }

  const initial = (userName ?? userEmail)?.[0]?.toUpperCase() ?? "?";

  return (
    <div className="flex h-full min-h-0">
      <h1 className="sr-only">פרופיל המשתמש</h1>
      {/* Sidebar — appears on RIGHT in RTL */}
      <aside className="w-56 border-l border-[#222222] bg-[#0d0d0d] shrink-0 flex flex-col">
        {/* Profile avatar + info */}
        <div className="px-5 py-6 border-b border-[#222222]">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 rounded-full bg-[#1A1200] border-2 border-[#FFB800]/30 flex items-center justify-center">
              <span className="text-xl font-mono font-semibold text-[#FFB800]">{initial}</span>
            </div>
            <div className="min-w-0 w-full">
              {userName && (
                <p className="text-sm font-medium text-[#E0E0E0] truncate">{userName}</p>
              )}
              <p className="text-sm text-[#B0B0B0] font-mono truncate" title={userEmail}>
                {userEmail}
              </p>
            </div>
          </div>
        </div>

        {/* Tab navigation */}
        <nav className="flex-1 px-2 py-4">
          <p className="px-3 mb-2 text-[10px] font-semibold text-[#444444] uppercase tracking-widest">
            הגדרות
          </p>
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => goToTab(tab.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all mb-0.5",
                  isActive
                    ? "bg-[#1A1200] text-[#FFB800] border-l-2 border-[#FFB800]"
                    : "text-[#B0B0B0] hover:text-[#E0E0E0] hover:bg-[#161616]"
                )}
              >
                <Icon size={16} className="shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Content area — appears on LEFT in RTL. Use a <section> here because the
          parent dashboard layout already provides the page's single <main>. */}
      <section aria-labelledby="profile-section-title" className="flex-1 overflow-y-auto">
        <h2 id="profile-section-title" className="sr-only">{TABS.find(t => t.id === activeTab)?.label ?? 'פרופיל'}</h2>
        <div className="max-w-2xl px-8 py-8">
          {activeTab === "account" && (
            <TabAccount
              userEmail={userEmail}
              initialName={userName}
              initialProfile={userProfile}
            />
          )}
          {activeTab === "security" && <TabSecurity userEmail={userEmail} />}
          {activeTab === "display" && <TabDisplay initialDisplay={userDisplay} />}
          {activeTab === "broker" && <TabBroker />}
        </div>
      </section>
    </div>
  );
}
