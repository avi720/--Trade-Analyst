// Single source of truth for the constrained values used by the manual-entry
// form, the Excel importer, the manual-close UI, and any future filters.

export const CURRENCIES = [
  'USD', 'EUR', 'ILS', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'CNY', 'HKD',
] as const
export type Currency = typeof CURRENCIES[number]

export const BROKERS = [
  'IBKR', 'COLMEX', 'BLINK', 'IBI', 'MEYTAV_TRADE', 'EXELLENCE_TRADE',
] as const
export type Broker = typeof BROKERS[number]

// Cascading setup-type catalogue. Two structured groups + a free-text "אחר".
// Storage format in Trade.setupType:
//   "<group> - <sub>"  for the two structured groups
//   "אחר - <custom>"   for free text (custom ≤ 15 non-whitespace chars)
export const SETUP_GROUPS = {
  'קרבה לממוצע': ['200 ימים', '150 ימים', '100 ימים'],
  'פריצת תבנית': [
    'קאפ והנדל',
    'דגל שורי',
    'אינברס ראש וכתפיים',
    'תחתית כפולה',
    'תחתית משולשת',
    'משולש יורד',
    'משולש עולה',
    'התכנסות מלבנית',
    'יתד יורד',
  ],
} as const

export const SETUP_CUSTOM_LABEL = 'אחר' as const

export type SetupGroupKey = keyof typeof SETUP_GROUPS

export const SETUP_GROUP_KEYS: SetupGroupKey[] = Object.keys(SETUP_GROUPS) as SetupGroupKey[]

// Hebrew non-whitespace character count, for the "אחר - <custom>" cap.
export function customCharLen(s: string): number {
  return s.replace(/\s/g, '').length
}

// Server-side validation of a setupType string. Returns null if valid, or an error message.
export function validateSetupType(s: string | null | undefined): string | null {
  if (!s) return null
  const t = s.trim()
  if (!t) return null
  // Custom "אחר" prefix
  if (t.startsWith(`${SETUP_CUSTOM_LABEL} - `)) {
    const custom = t.slice(SETUP_CUSTOM_LABEL.length + 3)
    if (!custom) return 'setupType: custom value required after "אחר - "'
    if (customCharLen(custom) > 15) return 'setupType: custom value over 15 non-whitespace chars'
    return null
  }
  // Structured "<group> - <sub>"
  for (const group of SETUP_GROUP_KEYS) {
    const prefix = `${group} - `
    if (t.startsWith(prefix)) {
      const sub = t.slice(prefix.length)
      const subs = SETUP_GROUPS[group] as readonly string[]
      if (!subs.includes(sub)) return `setupType: unknown sub-option "${sub}" for group "${group}"`
      return null
    }
  }
  return `setupType: value "${t}" does not match any known group`
}

export const EMOTIONAL_STATES = [
  'רגוע', 'מתוח', 'בטוח', 'FOMO', 'ביטחון יתר',
  'פחד', 'נקמה', 'היסוס', 'שיעמום', 'טילטול',
] as const
export type EmotionalState = typeof EMOTIONAL_STATES[number]
export const EMOTIONAL_CUSTOM_LABEL = 'אחר' as const

// Validates stored emotionalState string: must be a known value OR a free-text ≤ 20 chars.
export function validateEmotionalState(s: string | null | undefined): string | null {
  if (!s) return null
  const t = s.trim()
  if (!t) return null
  if ((EMOTIONAL_STATES as readonly string[]).includes(t)) return null
  if (t.length > 20) return 'emotionalState: custom value over 20 chars'
  return null
}

export const CLOSE_REASONS = [
  { key: 'original_stop', label: 'נמכר בסטופ המקורי',       requires: 'stop'    },
  { key: 'target',        label: 'נמכר במחיר היעד',          requires: 'target'  },
  { key: 'modified_stop', label: 'נמכר במחיר סטופ שונה',     requires: 'newStop' },
  { key: 'other',         label: 'נמכר במחיר/פקודה אחרים',   requires: null      },
] as const

export type CloseReasonKey = typeof CLOSE_REASONS[number]['key']
export const CLOSE_REASON_KEYS: readonly CloseReasonKey[] = CLOSE_REASONS.map(r => r.key)
