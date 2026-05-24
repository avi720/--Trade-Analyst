'use client'

import { useEffect, useRef, useState } from 'react'
import {
  SETUP_GROUPS,
  SETUP_GROUP_KEYS,
  SETUP_CUSTOM_LABEL,
  customCharLen,
  type SetupGroupKey,
} from '@/lib/constants/trade-options'

interface Props {
  value: string | null | undefined
  onChange: (v: string | undefined) => void
  inputCls: string
  selectCls: string
  labelCls: string
  idPrefix?: string
}

type GroupValue = SetupGroupKey | typeof SETUP_CUSTOM_LABEL | ''

interface Parsed {
  group: GroupValue
  sub: string
  custom: string
}

function parse(v: string | null | undefined): Parsed {
  if (!v) return { group: '', sub: '', custom: '' }
  for (const g of SETUP_GROUP_KEYS) {
    const prefix = `${g} - `
    if (v.startsWith(prefix)) return { group: g, sub: v.slice(prefix.length), custom: '' }
  }
  if (v.startsWith(`${SETUP_CUSTOM_LABEL} - `)) {
    return { group: SETUP_CUSTOM_LABEL, sub: '', custom: v.slice(SETUP_CUSTOM_LABEL.length + 3) }
  }
  return { group: '', sub: '', custom: '' }
}

// Serialize the local selection back to the stored string format, or undefined
// when the selection is incomplete (group without a sub, or custom without text).
function serialize(group: GroupValue, sub: string, custom: string): string | undefined {
  if (!group) return undefined
  if (group === SETUP_CUSTOM_LABEL) {
    const t = custom.trim()
    return t ? `${SETUP_CUSTOM_LABEL} - ${t}` : undefined
  }
  return sub ? `${group} - ${sub}` : undefined
}

export function SetupTypeInput({ value, onChange, inputCls, selectCls, labelCls, idPrefix = '' }: Props) {
  // Local state so a partial selection (group chosen, sub not yet) persists in
  // the UI even though it serializes to `undefined`. A fully-controlled value
  // prop can't represent that intermediate state.
  const [group, setGroup] = useState<GroupValue>(() => parse(value).group)
  const [sub, setSub] = useState<string>(() => parse(value).sub)
  const [custom, setCustom] = useState<string>(() => parse(value).custom)

  // Track what we last emitted so we can distinguish our own emits from genuine
  // external changes (form reset, editing a different trade). Only re-seed local
  // state on external changes.
  const lastEmitted = useRef<string | undefined>(value ?? undefined)
  useEffect(() => {
    const incoming = value ?? undefined
    if (incoming !== lastEmitted.current) {
      const p = parse(incoming)
      setGroup(p.group)
      setSub(p.sub)
      setCustom(p.custom)
      lastEmitted.current = incoming
    }
  }, [value])

  function commit(nextGroup: GroupValue, nextSub: string, nextCustom: string) {
    setGroup(nextGroup)
    setSub(nextSub)
    setCustom(nextCustom)
    const serialized = serialize(nextGroup, nextSub, nextCustom)
    lastEmitted.current = serialized
    onChange(serialized)
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label htmlFor={`${idPrefix}setup-type`} className={labelCls}>סיבת קנייה</label>
        <select
          id={`${idPrefix}setup-type`}
          value={group}
          onChange={e => commit(e.target.value as GroupValue, '', '')}
          className={selectCls}
        >
          <option value="">— בחר —</option>
          {SETUP_GROUP_KEYS.map(g => <option key={g} value={g}>{g}</option>)}
          <option value={SETUP_CUSTOM_LABEL}>{SETUP_CUSTOM_LABEL}</option>
        </select>
      </div>
      {group && group !== SETUP_CUSTOM_LABEL && (
        <div>
          <label htmlFor={`${idPrefix}setup-sub`} className={labelCls}>תת-סיבה</label>
          <select
            id={`${idPrefix}setup-sub`}
            value={sub}
            onChange={e => commit(group, e.target.value, '')}
            className={selectCls}
          >
            <option value="">— בחר —</option>
            {(SETUP_GROUPS[group as SetupGroupKey] as readonly string[]).map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      )}
      {group === SETUP_CUSTOM_LABEL && (
        <div>
          <label htmlFor={`${idPrefix}setup-custom`} className={labelCls}>סיבה (עד 15 תווים)</label>
          <input
            id={`${idPrefix}setup-custom`}
            type="text"
            value={custom}
            onChange={e => {
              const v = e.target.value
              if (customCharLen(v) > 15) return
              commit(SETUP_CUSTOM_LABEL, '', v)
            }}
            className={inputCls}
            placeholder="טקסט חופשי"
          />
        </div>
      )}
    </div>
  )
}
