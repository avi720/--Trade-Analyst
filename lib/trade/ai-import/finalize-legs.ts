import {
  manualLegSchema,
  type ManualLeg,
} from '@/lib/trade/manual-entry'
import {
  BROKERS,
  validateSetupType,
  validateEmotionalState,
} from '@/lib/constants/trade-options'
import type { LegError } from './types'

const BROKER_SET = new Set<string>(BROKERS as readonly string[])

/**
 * Final normalization for both pipelines (mapping → applyMapping legs, and
 * extraction → AI legs). Injects the user-chosen `hardTimezone` onto every leg,
 * sanitizes soft annotation/broker fields that would otherwise get the whole
 * leg dropped by validateLeg at persist time, and runs strict manualLegSchema
 * validation. Legs that still fail structural validation are reported by index.
 *
 * The timezone is ALWAYS the caller-supplied value — never anything the AI
 * produced — so FIFO chronology can't be corrupted by a model guess.
 */
export function finalizeLegs(
  rawLegs: Array<Record<string, unknown>>,
  hardTimezone: string,
): { legs: ManualLeg[]; errors: LegError[] } {
  const legs: ManualLeg[] = []
  const errors: LegError[] = []

  rawLegs.forEach((raw, i) => {
    // Drop null/undefined so manualLegSchema's `.optional()` (undefined-only)
    // fields don't choke on nulls coming from the AI.
    const cleaned: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(raw)) {
      if (v === null || v === undefined) continue
      cleaned[k] = v
    }

    // Sanitize soft fields: keep the trade, drop only the offending annotation.
    if (typeof cleaned.broker === 'string' && !BROKER_SET.has(cleaned.broker.trim())) {
      delete cleaned.broker
    }
    if (typeof cleaned.setupType === 'string' && validateSetupType(cleaned.setupType)) {
      delete cleaned.setupType
    }
    if (
      typeof cleaned.emotionalState === 'string' &&
      validateEmotionalState(cleaned.emotionalState)
    ) {
      delete cleaned.emotionalState
    }

    // Timezone is authoritative and user-supplied.
    cleaned.timezone = hardTimezone

    const parsed = manualLegSchema.safeParse(cleaned)
    if (!parsed.success) {
      errors.push({
        rowIndex: i,
        reason: parsed.error.issues
          .map((iss) => `${iss.path.join('.')}: ${iss.message}`)
          .join('; '),
      })
      return
    }
    legs.push(parsed.data as ManualLeg)
  })

  return { legs, errors }
}
