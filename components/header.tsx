'use client'

import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useState, useRef, useEffect } from 'react'
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
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null)
  const { toggleChat } = useChatContext()

  // Reposition when opening or on resize while open. The dropdown is
  // position:fixed because the header has overflow-x-auto (which CSS forces
  // to overflow-y:auto too), so absolute positioning would clip it.
  useEffect(() => {
    if (!dropdownOpen) {
      setDropdownPos(null)
      return
    }
    function reposition() {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (!rect) return
      const DROPDOWN_WIDTH = 192 // w-48
      const top = rect.bottom + 4
      // Default: align dropdown's left edge with button's left edge.
      // If that would overflow the viewport on the right, clamp so the
      // dropdown stays fully visible with an 8px margin.
      let left = rect.left
      if (left + DROPDOWN_WIDTH > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - DROPDOWN_WIDTH - 8)
      }
      setDropdownPos({ top, left })
    }
    reposition()
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [dropdownOpen])

  async function handleSignOut() {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="border-b border-border bg-panel px-4 sm:px-6 h-16 flex items-center justify-between gap-2 flex-shrink-0 overflow-x-auto">
      {/* App name — right side in RTL */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <TradeLogoIcon size={36} />
        <span className="font-mono font-semibold text-amber text-xl tracking-tight">
          Trade Analysis
        </span>
      </div>

      {/* Tabs — centered on wide screens, inline flow at ≤lg so they reflow
          instead of overlapping the logo/controls. */}
      <nav className="flex items-center gap-1 lg:absolute lg:left-1/2 lg:-translate-x-1/2 flex-shrink-0">
        {TABS.map(tab => (
          <Link
            key={tab.href}
            href={tab.href}
            prefetch={false}
            aria-current={pathname === tab.href || pathname.startsWith(tab.href + '/') ? 'page' : undefined}
            className={cn(
              'px-4 py-2 rounded-md text-base transition-colors border-b-2',
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
        <button
          ref={buttonRef}
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

        {dropdownOpen && dropdownPos && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setDropdownOpen(false)}
            />
            <div
              role="menu"
              className="fixed w-48 bg-panel border border-border rounded-md shadow-lg z-50 py-1"
              style={{ top: dropdownPos.top, left: dropdownPos.left }}
            >
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
    </header>
  )
}
