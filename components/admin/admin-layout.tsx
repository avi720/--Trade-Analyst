'use client'

import { useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Users, FileSpreadsheet, Plug, Activity } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

const TABS = [
  { id: 'users', label: 'משתמשים', href: '/admin/users', icon: Users },
  { id: 'jobs', label: 'ייבוא AI', href: '/admin/jobs', icon: FileSpreadsheet },
  { id: 'ibkr', label: 'ברוקר', href: '/admin/ibkr', icon: Plug },
  { id: 'broker-events', label: 'אירועי ברוקר', href: '/admin/broker-events', icon: Activity },
] as const

type TabId = (typeof TABS)[number]['id']

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const tablistRef = useRef<HTMLDivElement>(null)

  const activeTab: TabId =
    TABS.find(t => pathname === t.href || pathname.startsWith(t.href + '/'))?.id
    ?? 'users'

  function goToTab(id: TabId) {
    const tab = TABS.find(t => t.id === id)
    if (tab) router.push(tab.href)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    const idx = TABS.findIndex(t => t.id === activeTab)
    if (idx < 0) return
    let nextIdx = idx
    if (e.key === 'ArrowDown') nextIdx = (idx + 1) % TABS.length
    else if (e.key === 'ArrowUp') nextIdx = (idx - 1 + TABS.length) % TABS.length
    else if (e.key === 'Home') nextIdx = 0
    else if (e.key === 'End') nextIdx = TABS.length - 1
    else return
    e.preventDefault()
    goToTab(TABS[nextIdx].id)
    requestAnimationFrame(() => {
      const btn = tablistRef.current?.querySelector<HTMLButtonElement>(
        `[data-tab-id="${TABS[nextIdx].id}"]`,
      )
      btn?.focus()
    })
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
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  data-tab-id={tab.id}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`admin-tabpanel-${tab.id}`}
                  id={`admin-tab-${tab.id}`}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => goToTab(tab.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all mb-0.5',
                    isActive
                      ? 'bg-amber-tint text-amber border-l-2 border-amber'
                      : 'text-text-dim hover:text-text-main hover:bg-panel-3',
                  )}
                >
                  <Icon size={16} className="shrink-0" aria-hidden="true" />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </div>
        </nav>
      </aside>

      <section
        role="tabpanel"
        id={`admin-tabpanel-${activeTab}`}
        aria-labelledby={`admin-tab-${activeTab}`}
        tabIndex={0}
        className="flex-1 overflow-y-auto outline-none"
      >
        {children}
      </section>
    </div>
  )
}
