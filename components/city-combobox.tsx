'use client'

import { useEffect, useRef, useState } from 'react'

interface CityComboboxProps {
  value: string
  onChange: (city: string) => void
  cities: string[]
  loading: boolean
  error?: string
  placeholder?: string
}

export function CityCombobox({
  value,
  onChange,
  cities,
  loading,
  error,
  placeholder = 'הקלד לחיפוש...',
}: CityComboboxProps) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const filtered = query.length === 0
    ? cities.slice(0, 80)
    : cities.filter(c => c.includes(query)).slice(0, 80)

  // Keep query in sync when parent resets value
  useEffect(() => {
    setQuery(value)
  }, [value])

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        // Reset query to last confirmed value if user didn't pick
        setQuery(value)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [value])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false)
      setQuery(value)
    }
  }

  function handleSelect(city: string) {
    onChange(city)
    setQuery(city)
    setOpen(false)
  }

  const inputCls =
    'w-full bg-[#080808] border rounded px-3 py-2 text-sm text-[#E0E0E0] placeholder-[#444444] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FFB800] focus-visible:outline-offset-2 transition-colors ' +
    (error ? 'border-[#FF4D4D]' : 'border-[#222222] focus:border-[#444444]')

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={e => {
          setQuery(e.target.value)
          setOpen(true)
          // Clear selection if user types something that no longer matches
          if (e.target.value !== value) onChange('')
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={loading ? 'טוען ישובים...' : placeholder}
        disabled={loading}
        className={inputCls}
        autoComplete="off"
        dir="rtl"
      />

      {open && !loading && filtered.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 max-h-56 overflow-y-auto bg-[#111111] border border-[#222222] rounded shadow-lg">
          {filtered.map(city => (
            <li
              key={city}
              onMouseDown={() => handleSelect(city)}
              className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                city === value
                  ? 'bg-[#1A1200] text-[#FFB800]'
                  : 'text-[#E0E0E0] hover:bg-[#1a1a1a]'
              }`}
              dir="rtl"
            >
              {city}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
