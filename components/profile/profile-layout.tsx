"use client";

import { useRef } from "react";
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
  const tablistRef = useRef<HTMLDivElement>(null);

  function goToTab(id: TabId) {
    router.push(`/profile?tab=${id}`);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    const idx = TABS.findIndex(t => t.id === activeTab);
    if (idx < 0) return;
    let nextIdx = idx;
    // Vertical tablist on the right in RTL — Up/Down navigate.
    if (e.key === "ArrowDown") nextIdx = (idx + 1) % TABS.length;
    else if (e.key === "ArrowUp") nextIdx = (idx - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") nextIdx = 0;
    else if (e.key === "End") nextIdx = TABS.length - 1;
    else return;
    e.preventDefault();
    goToTab(TABS[nextIdx].id);
    requestAnimationFrame(() => {
      const btn = tablistRef.current?.querySelector<HTMLButtonElement>(
        `[data-tab-id="${TABS[nextIdx].id}"]`
      );
      btn?.focus();
    });
  }

  const initial = (userName ?? userEmail)?.[0]?.toUpperCase() ?? "?";

  return (
    <div className="flex h-full min-h-0">
      <h1 className="sr-only">פרופיל המשתמש</h1>
      {/* Sidebar — appears on RIGHT in RTL */}
      <aside className="w-56 border-l border-border bg-panel-2 shrink-0 flex flex-col">
        {/* Profile avatar + info */}
        <div className="px-5 py-6 border-b border-border">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 rounded-full bg-amber-tint border-2 border-amber/30 flex items-center justify-center">
              <span className="text-xl font-mono font-semibold text-amber">{initial}</span>
            </div>
            <div className="min-w-0 w-full">
              {userName && (
                <p className="text-sm font-medium text-text-main truncate">{userName}</p>
              )}
              <p className="text-sm text-text-dim font-mono truncate" title={userEmail}>
                {userEmail}
              </p>
            </div>
          </div>
        </div>

        {/* Tab navigation */}
        <nav className="flex-1 px-2 py-4">
          <p id="profile-tablist-label" className="px-3 mb-2 text-[10px] font-semibold text-text-faint uppercase tracking-widest">
            הגדרות
          </p>
          <div
            ref={tablistRef}
            role="tablist"
            aria-orientation="vertical"
            aria-labelledby="profile-tablist-label"
            onKeyDown={handleKeyDown}
          >
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  data-tab-id={tab.id}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`profile-tabpanel-${tab.id}`}
                  id={`profile-tab-${tab.id}`}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => goToTab(tab.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all mb-0.5",
                    isActive
                      ? "bg-amber-tint text-amber border-l-2 border-amber"
                      : "text-text-dim hover:text-text-main hover:bg-panel-3"
                  )}
                >
                  <Icon size={16} className="shrink-0" aria-hidden="true" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </aside>

      {/* Content area — appears on LEFT in RTL. Use a <section> here because the
          parent dashboard layout already provides the page's single <main>. */}
      <section
        role="tabpanel"
        id={`profile-tabpanel-${activeTab}`}
        aria-labelledby={`profile-tab-${activeTab}`}
        tabIndex={0}
        className="flex-1 overflow-y-auto outline-none"
      >
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
