'use client'

import { useEffect, useRef, useState } from 'react'
import { EMOTIONAL_STATES, EMOTIONAL_CUSTOM_LABEL } from '@/lib/constants/trade-options'

interface Props {
  value: string | null | undefined
  onChange: (v: string | undefined) => void
  inputCls: string
  selectCls: string
  labelCls: string
}

const KNOWN = EMOTIONAL_STATES as readonly string[]

// Derive the dropdown selection ('' | a known value | the custom label) from a
// stored value, plus the custom text when applicable.
function deriveMode(value: string | null | undefined): { select: string; custom: string } {
  const v = value ?? ''
  if (!v) return { select: '', custom: '' }
  if (KNOWN.includes(v)) return { select: v, custom: '' }
  return { select: EMOTIONAL_CUSTOM_LABEL, custom: v }
}

export function EmotionalStateInput({ value, onChange, inputCls, selectCls, labelCls }: Props) {
  // Local state so choosing "אחר" (custom) shows the text field even before any
  // text is typed — a fully-controlled value prop can't represent that.
  const [select, setSelect] = useState<string>(() => deriveMode(value).select)
  const [custom, setCustom] = useState<string>(() => deriveMode(value).custom)

  const lastEmitted = useRef<string | undefined>(value ?? undefined)
  useEffect(() => {
    const incoming = value ?? undefined
    if (incoming !== lastEmitted.current) {
      const d = deriveMode(incoming)
      setSelect(d.select)
      setCustom(d.custom)
      lastEmitted.current = incoming
    }
  }, [value])

  function commit(nextSelect: string, nextCustom: string) {
    setSelect(nextSelect)
    setCustom(nextCustom)
    let serialized: string | undefined
    if (!nextSelect) serialized = undefined
    else if (nextSelect === EMOTIONAL_CUSTOM_LABEL) serialized = nextCustom.trim() || undefined
    else serialized = nextSelect
    lastEmitted.current = serialized
    onChange(serialized)
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className={labelCls}>מצב רגשי</label>
        <select
          value={select}
          onChange={e => commit(e.target.value, '')}
          className={selectCls}
        >
          <option value="">— בחר —</option>
          {EMOTIONAL_STATES.map(s => <option key={s} value={s}>{s}</option>)}
          <option value={EMOTIONAL_CUSTOM_LABEL}>{EMOTIONAL_CUSTOM_LABEL}</option>
        </select>
      </div>
      {select === EMOTIONAL_CUSTOM_LABEL && (
        <div>
          <label className={labelCls}>תיאור (עד 20 תווים)</label>
          <input
            type="text"
            value={custom}
            maxLength={20}
            onChange={e => commit(EMOTIONAL_CUSTOM_LABEL, e.target.value)}
            className={inputCls}
            placeholder="טקסט חופשי"
          />
        </div>
      )}
    </div>
  )
}
