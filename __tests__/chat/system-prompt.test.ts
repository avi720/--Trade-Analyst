import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from '@/lib/chat/system-prompt'

const context = '### היקף\nטריידים סגורים בהיקף: 42.'

describe('buildSystemPrompt — capability statement per mode', () => {
  it('always ends with the context block', () => {
    const p = buildSystemPrompt({ context, mode: 'smart' })
    expect(p.endsWith(context)).toBe(true)
    expect(p).toContain('הנתונים הנוכחיים:')
  })

  it('smart mode names the gated fields as a Pro capability, not as missing data', () => {
    const p = buildSystemPrompt({ context, mode: 'smart' })
    expect(p).toContain('קיימים במערכת')
    expect(p).toContain('זמין במצב "עומק"')
    // The failure this guards against: telling the user to re-enter data the
    // app already stores.
    expect(p).toContain('אל תבקש ממנו להזין את הנתונים מחדש')
  })

  it('smart mode is told not to silently drop the unanswerable half of a question', () => {
    const p = buildSystemPrompt({ context, mode: 'smart' })
    expect(p).toContain('אל תשמיט חלק מהשאלה בשקט')
  })

  it('full mode advertises the extra fields and keeps free text opt-in', () => {
    const p = buildSystemPrompt({ context, mode: 'full' })
    expect(p).toContain('שעת הפתיחה')
    expect(p).toContain('queryTrades')
    expect(p).not.toContain('קיימים במערכת')
  })

  it('always carries the scope-honesty rules', () => {
    for (const mode of ['smart', 'full'] as const) {
      expect(buildSystemPrompt({ context, mode })).toContain('אל תניח שראית את כל ההיסטוריה')
    }
  })
})

describe('buildSystemPrompt — tool section', () => {
  it('is omitted when no tools are registered', () => {
    const p = buildSystemPrompt({ context, mode: 'full' })
    expect(p).not.toContain('עומדים לרשותך הכלים הבאים')
  })

  it('lists the registered tool names when tools are on', () => {
    const p = buildSystemPrompt({
      context, mode: 'full', toolNames: ['queryTrades', 'getSetupBreakdown'],
    })
    expect(p).toContain('עומדים לרשותך הכלים הבאים: queryTrades, getSetupBreakdown.')
  })

  it('is omitted for an empty tool list', () => {
    const p = buildSystemPrompt({ context, mode: 'full', toolNames: [] })
    expect(p).not.toContain('עומדים לרשותך הכלים הבאים')
  })
})

describe('buildSystemPrompt — P1-D web/tool exclusivity', () => {
  it('explains the trade-off when grounding is on', () => {
    const p = buildSystemPrompt({ context, mode: 'full', webSearch: true })
    expect(p).toContain('יש לך גישה לחיפוש בגוגל')
    expect(p).toContain('אי אפשר גם לחפש באינטרנט וגם להריץ שאילתות מתקדמות')
    expect(p).toContain('אל תתעלם מחצי מהשאלה בשקט')
  })

  it('explains why the web is unavailable on a tool turn', () => {
    const p = buildSystemPrompt({
      context, mode: 'full', toolNames: ['queryTrades'], webSearch: false,
    })
    expect(p).toContain('אין לך גישה לחיפוש בגוגל')
    expect(p).toContain('בהודעה נפרדת')
  })

  it('says nothing about the web for a Free-tier turn — no tools, no grounding', () => {
    const p = buildSystemPrompt({ context, mode: 'smart', webSearch: false })
    expect(p).not.toContain('חיפוש באינטרנט')
  })

  it('never claims both capabilities in the same turn', () => {
    const grounded = buildSystemPrompt({
      context, mode: 'full', toolNames: ['queryTrades'], webSearch: true,
    })
    expect(grounded).toContain('יש לך גישה לחיפוש בגוגל')
    expect(grounded).not.toContain('אין לך גישה לחיפוש בגוגל')
  })
})
