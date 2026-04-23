import { useState } from 'react'

const INPUT = 'bg-[#1a1a1a] border border-[#333] text-white text-sm rounded px-3 py-2 focus:outline-none focus:border-[#FFB800] w-full'
const SELECT = 'bg-[#1a1a1a] border border-[#333] text-white text-sm rounded px-3 py-2 focus:outline-none focus:border-[#FFB800] w-full cursor-pointer'
const LABEL = 'text-[10px] uppercase tracking-wider text-[#888] block mb-1'

const EMPTY = {
  ticker: '', direction: 'Long', setup_type: 'breakout',
  entry_price: '', stop_price: '', target_price: '', emotional_state: '',
  exit_price: '', result: 'Win', execution_quality: '7', did_right: '', would_change: '',
}

export default function TradeForm({ onSubmit, loading }) {
  const [form, setForm] = useState(EMPTY)
  const [step, setStep] = useState(1)
  const [wordCount, setWordCount] = useState(0)

  const set = field => e => setForm(f => ({ ...f, [field]: e.target.value }))

  function handleEmotion(e) {
    const words = e.target.value.trim().split(/\s+/).filter(Boolean)
    if (words.length > 20) {
      e.target.value = words.slice(0, 20).join(' ')
    }
    setWordCount(Math.min(words.length, 20))
    setForm(f => ({ ...f, emotional_state: e.target.value }))
  }

  function calcR() {
    const entry = parseFloat(form.entry_price)
    const stop = parseFloat(form.stop_price)
    const target = parseFloat(form.target_price)
    if (!entry || !stop) return null
    const risk = Math.abs(entry - stop)
    if (!risk) return null
    if (target) return parseFloat(((Math.abs(target - entry)) / risk).toFixed(2))
    return null
  }

  function handleStep1(e) {
    e.preventDefault()
    if (!form.ticker || !form.entry_price) return
    setStep(2)
  }

  function handleSubmit(e) {
    e.preventDefault()
    const entry = parseFloat(form.entry_price)
    const stop = parseFloat(form.stop_price) || null
    const target = parseFloat(form.target_price) || null
    const exit = parseFloat(form.exit_price) || null
    const risk = stop ? Math.abs(entry - stop) : null
    let actual_r = null
    if (exit && entry && risk) {
      actual_r = parseFloat(((exit - entry) * (form.direction === 'Long' ? 1 : -1) / risk).toFixed(2))
    }
    const r_planned = calcR()

    onSubmit({
      ticker: form.ticker.toUpperCase(),
      direction: form.direction,
      setup_type: form.setup_type,
      entry_price: entry,
      stop_price: stop,
      target_price: target,
      r_multiple_entry: r_planned,
      exit_price: exit,
      result: form.result,
      actual_r,
      execution_quality: parseInt(form.execution_quality) || null,
      emotional_state: form.emotional_state,
      did_right: form.did_right,
      would_change: form.would_change,
    })
    setForm(EMPTY)
    setStep(1)
    setWordCount(0)
  }

  const rPlanned = calcR()

  return (
    <form onSubmit={step === 1 ? handleStep1 : handleSubmit} className="space-y-4">
      {/* Step indicator */}
      <div className="flex gap-2 mb-6">
        {[1, 2].map(s => (
          <div key={s} className={`flex-1 h-1 rounded transition-colors ${s <= step ? 'bg-[#FFB800]' : 'bg-[#222]'}`} />
        ))}
      </div>

      {step === 1 && (
        <>
          <p className="text-xs text-[#888] mb-4">שלב 1 מתוך 2 — פתיחת עסקה</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>סימול *</label>
              <input className={INPUT + ' uppercase font-mono'} value={form.ticker} onChange={set('ticker')} placeholder="AAPL" required />
            </div>
            <div>
              <label className={LABEL}>כיוון</label>
              <select className={SELECT} value={form.direction} onChange={set('direction')}>
                <option value="Long">Long</option>
                <option value="Short">Short</option>
              </select>
            </div>
            <div>
              <label className={LABEL}>סטאפ</label>
              <select className={SELECT} value={form.setup_type} onChange={set('setup_type')}>
                <option value="breakout">פריצה</option>
                <option value="pullback_ema">פולבק EMA</option>
                <option value="range">טווח</option>
                <option value="vcp">VCP</option>
                <option value="other">אחר</option>
              </select>
            </div>
            <div>
              <label className={LABEL}>כניסה $ *</label>
              <input type="number" step="0.01" className={INPUT + ' font-mono'} value={form.entry_price} onChange={set('entry_price')} placeholder="0.00" required />
            </div>
            <div>
              <label className={LABEL}>סטופ $</label>
              <input type="number" step="0.01" className={INPUT + ' font-mono'} value={form.stop_price} onChange={set('stop_price')} placeholder="0.00" />
            </div>
            <div>
              <label className={LABEL}>
                יעד $
                {rPlanned && <span className="text-[#FFB800] mr-2">(R מתוכנן: {rPlanned}R)</span>}
              </label>
              <input type="number" step="0.01" className={INPUT + ' font-mono'} value={form.target_price} onChange={set('target_price')} placeholder="0.00" />
            </div>
          </div>
          <div>
            <label className={LABEL}>
              רגש בכניסה
              <span className={`mr-2 ${wordCount >= 20 ? 'text-[#FF4D4D]' : 'text-[#555]'}`}>({wordCount}/20 מילים)</span>
            </label>
            <input
              type="text"
              className={INPUT}
              value={form.emotional_state}
              onInput={handleEmotion}
              placeholder="תאר בקצרה את מצבך הרגשי..."
            />
          </div>
          <button type="submit" className="w-full bg-[#FFB800]/20 border border-[#FFB800]/40 text-[#FFB800] py-2.5 rounded hover:bg-[#FFB800]/30 transition-colors text-sm font-semibold">
            המשך לסגירה →
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <p className="text-xs text-[#888] mb-4">שלב 2 מתוך 2 — סגירת עסקה</p>
          <div className="bg-[#0d0d0d] border border-[#1a1a1a] rounded p-3 text-xs text-[#888] mb-2">
            <span className="font-mono text-white">{form.ticker || '—'}</span>
            {' '}{form.direction} · כניסה ${form.entry_price}
            {form.stop_price && ` · סטופ $${form.stop_price}`}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>יציאה $</label>
              <input type="number" step="0.01" className={INPUT + ' font-mono'} value={form.exit_price} onChange={set('exit_price')} placeholder="0.00" />
            </div>
            <div>
              <label className={LABEL}>תוצאה</label>
              <select className={SELECT} value={form.result} onChange={set('result')}>
                <option value="Win">רווח</option>
                <option value="Loss">הפסד</option>
                <option value="Breakeven">מאוזן</option>
                <option value="Open">פתוח</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className={LABEL}>ציון ביצוע (1-10)</label>
              <input type="range" min="1" max="10" className="w-full accent-[#FFB800]" value={form.execution_quality} onChange={set('execution_quality')} />
              <div className="text-center font-mono text-[#FFB800] text-lg">{form.execution_quality}</div>
            </div>
            <div className="col-span-2">
              <label className={LABEL}>מה עשית נכון?</label>
              <input type="text" className={INPUT} value={form.did_right} onChange={set('did_right')} placeholder="..." />
            </div>
            <div className="col-span-2">
              <label className={LABEL}>מה היית משנה?</label>
              <input type="text" className={INPUT} value={form.would_change} onChange={set('would_change')} placeholder="..." />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setStep(1)} className="flex-1 border border-[#333] py-2 rounded text-sm hover:bg-[#1a1a1a] transition-colors">
              ← חזור
            </button>
            <button type="submit" disabled={loading} className="flex-1 bg-[#2CC84A]/20 border border-[#2CC84A]/40 text-[#2CC84A] py-2 rounded hover:bg-[#2CC84A]/30 transition-colors text-sm font-semibold disabled:opacity-50">
              {loading ? 'מנתח...' : 'שלח ל-AI ושמור'}
            </button>
          </div>
        </>
      )}
    </form>
  )
}
