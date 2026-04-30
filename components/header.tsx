'use client'

import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'
import { SyncIndicator } from './sync-indicator'
import { cn } from '@/lib/utils/cn'
import { useChatContext } from '@/lib/chat/chat-context'

const TABS = [
  { label: 'תחקור', href: '/research' },
  { label: 'חיפוש', href: '/search' },
  { label: 'ייבוא-ידני', href: '/manual-import' },
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
    <header className="border-b border-[#222222] bg-[#111111] px-6 h-14 flex items-center justify-between flex-shrink-0">
      {/* App name — right side in RTL */}
      <div className="flex items-center gap-4">
        <span className="font-mono font-semibold text-[#FFB800] text-lg tracking-tight">
          Trade Analysis
        </span>
      </div>

      {/* Tabs — center */}
      <nav className="flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
        {TABS.map(tab => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'px-4 py-2 rounded-md text-sm font-medium transition-colors',
              pathname === tab.href || pathname.startsWith(tab.href + '/')
                ? 'bg-[#1A1A1A] text-[#E0E0E0]'
                : 'text-[#888888] hover:text-[#E0E0E0] hover:bg-[#1A1A1A]'
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
          className="px-3 py-1.5 rounded-md text-sm font-mono text-[#FFB800] hover:bg-[#1A1A1A] transition-colors border border-[#333333]"
        >
          חנן ▶
        </button>
        <SyncIndicator />

        {/* User dropdown */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(p => !p)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-[#888888] hover:text-[#E0E0E0] hover:bg-[#1A1A1A] transition-colors"
          >
            <span className="w-6 h-6 rounded-full bg-[#222222] flex items-center justify-center text-xs font-mono text-[#FFB800]">
              {userEmail?.[0]?.toUpperCase() ?? 'U'}
            </span>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {dropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setDropdownOpen(false)}
              />
              <div className="absolute left-0 mt-1 w-48 bg-[#111111] border border-[#222222] rounded-md shadow-lg z-20 py-1">
                <div className="px-3 py-2 text-xs text-[#888888] border-b border-[#222222] font-mono truncate">
                  {userEmail}
                </div>
                <Link
                  href="/profile"
                  className="block px-3 py-2 text-sm text-[#E0E0E0] hover:bg-[#1A1A1A]"
                  onClick={() => setDropdownOpen(false)}
                >
                  פרופיל
                </Link>
                <Link
                  href="/settings"
                  className="block px-3 py-2 text-sm text-[#E0E0E0] hover:bg-[#1A1A1A]"
                  onClick={() => setDropdownOpen(false)}
                >
                  הגדרות
                </Link>
                <div className="border-t border-[#222222] mt-1 pt-1">
                  <button
                    onClick={handleSignOut}
                    className="block w-full text-right px-3 py-2 text-sm text-[#FF4D4D] hover:bg-[#1A1A1A]"
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
