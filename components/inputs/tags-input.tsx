'use client'

import { useEffect, useRef, useState } from 'react'
import { normalizeTags, TAG_MAX_COUNT, TAG_MAX_LEN } from '@/lib/constants/trade-options'

interface Props {
  value: string[] | null | undefined
  onChange: (v: string[]) => void
  inputCls: string
  labelCls: string
  idPrefix?: string
  /** Optional suggestion pool; when omitted the input fetches the user's own tags once. */
  suggestions?: string[]
}

// Module-level cache: the three call sites (entry form, closed form, detail
// modal) can mount many times per page — one GET per page is plenty.
let cachedTags: string[] | null = null
let cachedTagsPromise: Promise<string[]> | null = null
function loadUserTags(): Promise<string[]> {
  if (cachedTags) return Promise.resolve(cachedTags)
  if (!cachedTagsPromise) {
    cachedTagsPromise = fetch('/api/trades/tags')
      .then(r => (r.ok ? r.json() : { tags: [] }))
      .then((j: { tags?: Array<{ tag: string }> }) => {
        cachedTags = (j.tags ?? []).map(t => t.tag)
        return cachedTags
      })
      .catch(() => [])
  }
  return cachedTagsPromise
}
/** Call after a save so the next mount sees the new tag. */
export function invalidateTagSuggestions() {
  cachedTags = null
  cachedTagsPromise = null
}

/**
 * Chip input for free-form tags. Enter or "," commits the draft, Backspace on
 * an empty draft removes the last chip. Suggestions follow the TickerCombobox
 * pattern (see components/research/filter-bar.tsx) — <datalist> is out because
 * it renders LTR-broken in RTL. Limits mirror lib/constants/trade-options.ts.
 */
export function TagsInput({ value, onChange, inputCls, labelCls, idPrefix = '', suggestions }: Props) {
  const tags = value ?? []
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(0)
  // Fetched pool only; an explicit `suggestions` prop is derived, not mirrored
  // into state (react-hooks/set-state-in-effect).
  const [fetchedPool, setFetchedPool] = useState<string[]>([])
  const pool = suggestions ?? fetchedPool
  const ref = useRef<HTMLDivElement>(null)
  const inputId = `${idPrefix}tags`
  const listId = `${idPrefix}tags-listbox`

  useEffect(() => {
    if (suggestions) return
    let cancelled = false
    loadUserTags().then(t => { if (!cancelled) setFetchedPool(t) })
    return () => { cancelled = true }
  }, [suggestions])

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const q = draft.trim().toLowerCase()
  const taken = new Set(tags.map(t => t.toLowerCase()))
  const matches = pool
    .filter(t => !taken.has(t.toLowerCase()) && (q === '' || t.toLowerCase().startsWith(q)))
    .slice(0, 8)

  const [prevDraft, setPrevDraft] = useState(draft)
  if (draft !== prevDraft) { setPrevDraft(draft); setHighlightIdx(0) }

  const atCap = tags.length >= TAG_MAX_COUNT

  function commit(raw: string) {
    const next = normalizeTags([...tags, raw])
    if (next.length > TAG_MAX_COUNT) return
    setDraft('')
    setOpen(false)
    if (next.length !== tags.length) onChange(next)
  }

  function remove(idx: number) {
    onChange(tags.filter((_, i) => i !== idx))
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) { setOpen(true); return }
      setHighlightIdx(i => Math.min(i + 1, matches.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' || e.key === ',') {
      // Enter inside a form must not submit it while the user is adding a tag.
      e.preventDefault()
      if (open && matches[highlightIdx] && draft.trim() === '') commit(matches[highlightIdx])
      else if (open && matches[highlightIdx] && matches.length > 0 && highlightIdx > 0) commit(matches[highlightIdx])
      else if (draft.trim()) commit(draft)
      else if (open && matches[highlightIdx]) commit(matches[highlightIdx])
    } else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
      remove(tags.length - 1)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={ref} className="relative">
      <label htmlFor={inputId} className={labelCls}>
        תגיות <span className="text-text-mute">({tags.length}/{TAG_MAX_COUNT})</span>
      </label>
      <div className={`${inputCls} flex flex-wrap items-center gap-1 min-h-9 py-1 cursor-text`} onClick={() => document.getElementById(inputId)?.focus()}>
        {tags.map((t, i) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full border border-amber/40 bg-amber-tint px-2 py-0.5 text-xs font-sans text-text-main">
            {t}
            <button
              type="button"
              onClick={e => { e.stopPropagation(); remove(i) }}
              aria-label={`הסר תגית ${t}`}
              className="text-text-dim hover:text-red leading-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber rounded"
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={inputId}
          type="text"
          value={draft}
          disabled={atCap}
          maxLength={TAG_MAX_LEN}
          onChange={e => { setDraft(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => { if (draft.trim()) commit(draft) }}
          onKeyDown={onKeyDown}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          role="combobox"
          placeholder={atCap ? 'הגעת למקסימום' : tags.length === 0 ? 'הקלד ו-Enter…' : ''}
          className="flex-1 min-w-24 bg-transparent outline-none text-sm font-sans disabled:cursor-not-allowed"
        />
      </div>
      {open && !atCap && matches.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full mt-1 z-30 min-w-40 max-h-60 overflow-auto rounded border border-border bg-panel shadow-lg py-1"
        >
          {matches.map((t, i) => (
            <li
              key={t}
              role="option"
              aria-selected={i === highlightIdx}
              onMouseDown={e => { e.preventDefault(); commit(t) }}
              onMouseEnter={() => setHighlightIdx(i)}
              className={
                'px-2 py-1 text-sm font-sans cursor-pointer ' +
                (i === highlightIdx ? 'bg-input-bg text-amber' : 'text-text-main hover:bg-input-bg')
              }
            >
              {t}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
