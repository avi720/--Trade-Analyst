'use client'

import { useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Users, FileSpreadsheet, Plug, Activity, HeartPulse } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { AdminContentSkeleton } from './admin-content-skeleton'

const TABS = [
  { id: 'users', label: 'משתמשים', href: '/admin/users', icon: Users },
  { id: 'jobs', label: 'ייבוא AI', href: '/admin/jobs', icon: FileSpreadsheet },
  { id: 'ibkr', label: 'ברוקר', href: '/admin/ibkr', icon: Plug },
  { id: 'broker-events', label: 'אירועי ברוקר', href: '/admin/broker-events', icon: Activity },
  { id: 'health', label: 'בריאות', href: '/admin/health', icon: HeartPulse },
] as const

type TabId = (typeof TABS)[number]['id']

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const tablistRef = useRef<HTMLDivElement>(null)
  // The tab the user just clicked, before the route commits. Drives an instant
  // content skeleton on sibling nav (see AdminContentSkeleton for why loading.tsx
  // can't) and an optimistic sidebar highlight.
  const [pendingId, setPendingId] = useState<TabId | null>(null)

  const activeTab: TabId =
    TABS.find(t => pathname === t.href || pathname.startsWith(t.href + '/'))?.id
    ?? 'users'

  // The route committed (or the user navigated away, e.g. browser back) — drop
  // the pending state so the real page shows. Comparing against the previous
  // pathname during render rather than clearing it in a `[pathname]` effect
  // also drops the one frame where the skeleton lingered over the committed
  // route. Note this deliberately tracks *changes* to the pathname rather than
  // remembering which pathname the click happened on: the latter resurrects a
  // stale pending tab when the user navigates back to that same pathname.
  const [prevPathname, setPrevPathname] = useState(pathname)
  if (pathname !== prevPathname) {
    setPrevPathname(pathname)
    setPendingId(null)
  }

  const highlightId = pendingId ?? activeTab
  // Show the skeleton while navigating to a *different* tab than the one the
  // committed route is on.
  const showSkeleton = pendingId !== null && pendingId !== activeTab

  function navigateToTab(id: TabId) {
    if (id !== activeTab) setPendingId(id)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    const idx = TABS.findIndex(t => t.id === highlightId)
    if (idx < 0) return
    let nextIdx = idx
    if (e.key === 'ArrowDown') nextIdx = (idx + 1) % TABS.length
    else if (e.key === 'ArrowUp') nextIdx = (idx - 1 + TABS.length) % TABS.length
    else if (e.key === 'Home') nextIdx = 0
    else if (e.key === 'End') nextIdx = TABS.length - 1
    else return
    e.preventDefault()
    // Focus + activate the next tab. Triggering the <a>'s click runs Next's
    // client navigation and our onClick (which sets the pending state), keeping
    // a single nav path for mouse and keyboard.
    const nextLink = tablistRef.current?.querySelector<HTMLAnchorElement>(
      `[data-tab-id="${TABS[nextIdx].id}"]`,
    )
    nextLink?.focus()
    nextLink?.click()
  }

  return (
    <div className="flex h-full min-h-0">
      <h1 className="sr-only">מנהל</h1>
      <aside className="w-56 border-l border-border bg-panel-2 shrink-0 flex flex-col">
        <div className="px-5 py-6 border-b border-border">
          <p className="text-xs font-semibold text-amber uppercase tracking-widest">
            אזור מנהל
          </p>
          <p className="text-xs text-text-dim mt-1">
            כלים פנימיים לבעל האתר
          </p>
        </div>

        <nav className="flex-1 px-2 py-4">
          <p
            id="admin-tablist-label"
            className="px-3 mb-2 text-[10px] font-semibold text-text-faint uppercase tracking-widest"
          >
            תפריט
          </p>
          <div
            ref={tablistRef}
            role="tablist"
            aria-orientation="vertical"
            aria-labelledby="admin-tablist-label"
            onKeyDown={handleKeyDown}
          >
            {TABS.map(tab => {
              const Icon = tab.icon
              const isActive = highlightId === tab.id
              return (
                <Link
                  key={tab.id}
                  href={tab.href}
                  data-tab-id={tab.id}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`admin-tabpanel-${tab.id}`}
                  id={`admin-tab-${tab.id}`}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => navigateToTab(tab.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all mb-0.5',
                    isActive
                      ? 'bg-amber-tint text-amber border-l-2 border-amber'
                      : 'text-text-dim hover:text-text-main hover:bg-panel-3',
                  )}
                >
                  <Icon size={16} className="shrink-0" aria-hidden="true" />
                  <span>{tab.label}</span>
                </Link>
              )
            })}
          </div>
        </nav>
      </aside>

      <section
        role="tabpanel"
        id={`admin-tabpanel-${highlightId}`}
        aria-labelledby={`admin-tab-${highlightId}`}
        tabIndex={0}
        className="flex-1 overflow-y-auto outline-none"
      >
        {showSkeleton ? <AdminContentSkeleton /> : children}
      </section>
    </div>
  )
}
