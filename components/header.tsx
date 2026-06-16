'use client'

import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'
import { SyncIndicator } from './sync-indicator'
import { TradeLogoIcon } from './trade-logo'
import { cn } from '@/lib/utils/cn'
import { useChatContext } from '@/lib/chat/chat-context'

const TABS = [
  { label: 'תחקור', href: '/research' },
  { label: 'חיפוש', href: '/search' },
  { label: 'הזנת טריידים', href: '/manual-import' },
]

interface HeaderProps {
  userEmail?: string
}

export function Header({ userEmail }: HeaderProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const { toggleChat } = useChatContext()

  async function handleSignOut() {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="border-b border-border bg-panel px-6 h-14 flex items-center justify-between flex-shrink-0">
      {/* App name — right side in RTL */}
      <div className="flex items-center gap-3">
        <TradeLogoIcon size={32} />
        <span className="font-mono font-semibold text-amber text-lg tracking-tight">
          Trade Analysis
        </span>
      </div>

      {/* Tabs — center */}
      <nav className="flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
        {TABS.map(tab => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={pathname === tab.href || pathname.startsWith(tab.href + '/') ? 'page' : undefined}
            className={cn(
              'px-4 py-2 rounded-md text-sm transition-colors border-b-2',
              pathname === tab.href || pathname.startsWith(tab.href + '/')
                ? 'bg-input-bg text-amber font-bold border-amber'
                : 'text-text-dim font-medium hover:text-text-main hover:bg-panel-3 border-transparent'
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {/* Left side in RTL: chat toggle + sync indicator + user dropdown */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggleChat}
          aria-label="פתח/סגור עוזר AI חנן"
          className="px-3 py-1.5 rounded-md text-sm font-mono text-amber hover:bg-input-bg transition-colors border border-shade"
        >
          חנן ה-AI <span aria-hidden="true">▶</span>
        </button>
        <SyncIndicator />

        {/* User dropdown */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(p => !p)}
            aria-haspopup="menu"
            aria-expanded={dropdownOpen}
            aria-label={userEmail ? `תפריט משתמש: ${userEmail}` : 'תפריט משתמש'}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-text-dim hover:text-text-main hover:bg-input-bg transition-colors"
          >
            <span className="w-6 h-6 rounded-full bg-border flex items-center justify-center text-xs font-mono text-amber">
              {userEmail?.[0]?.toUpperCase() ?? 'U'}
            </span>
            <svg aria-hidden="true" className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {dropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setDropdownOpen(false)}
              />
              <div className="absolute left-0 mt-1 w-48 bg-panel border border-border rounded-md shadow-lg z-20 py-1">
                <div className="px-3 py-2 text-sm text-text-dim border-b border-border font-mono truncate">
                  {userEmail}
                </div>
                <Link
                  href="/profile"
                  className="block px-3 py-2 text-sm text-text-main hover:bg-input-bg"
                  onClick={() => setDropdownOpen(false)}
                >
                  פרופיל והגדרות
                </Link>
                <div className="border-t border-border mt-1 pt-1">
                  <button
                    onClick={handleSignOut}
                    className="block w-full text-right px-3 py-2 text-sm text-red hover:bg-input-bg"
                  >
                    התנתק
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
