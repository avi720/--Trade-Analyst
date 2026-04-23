import TradeForm from './TradeForm'

export default function AddTrade({ onTradeAdded, aiHook }) {
  const { analyze, loading, error } = aiHook

  async function handleSubmit(tradeData) {
    const entry = tradeData.entry_price
    const stop = tradeData.stop_price
    const dir = tradeData.direction === 'Short' ? 'שורט על' : 'לונג על'

    let prompt = `ביצעתי עסקת ${dir} ${tradeData.ticker}.\n`
    prompt += `כניסה: $${entry}. סטופ: ${stop ? '$' + stop : 'לא מוגדר!'}. יעד: ${tradeData.target_price ? '$' + tradeData.target_price : 'לא מוגדר'}.\n`
    prompt += `רגש בכניסה: ${tradeData.emotional_state || 'לא צוין'}.\n`

    if (tradeData.result !== 'Open') {
      prompt += `\nהעסקה נסגרה ב-${tradeData.result === 'Win' ? 'רווח' : tradeData.result === 'Loss' ? 'הפסד' : 'איזון'}`
      if (tradeData.exit_price) prompt += `, מחיר יציאה: $${tradeData.exit_price}`
      prompt += `.\nאיכות ביצוע (מתוך 10): ${tradeData.execution_quality || 'לא תועד'}.\n`
      if (tradeData.did_right) prompt += `מה עשיתי נכון: ${tradeData.did_right}\n`
      if (tradeData.would_change) prompt += `מה הייתי משנה: ${tradeData.would_change}`
    } else {
      prompt += `\nסטטוס: עסקה עדיין פתוחה.`
    }

    const result = await analyze(prompt)
    if (result) {
      const merged = result.tradeData ? { ...tradeData, ...result.tradeData } : tradeData
      onTradeAdded(merged, result.text)
    } else {
      onTradeAdded(tradeData, null)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-xl mx-auto">
        <h2 className="text-lg font-bold text-zinc-300 mb-6">עסקה חדשה</h2>
        {error && (
          <div className="mb-4 p-3 bg-red-950/30 border border-red-900/50 rounded text-red-400 text-xs">
            שגיאת AI: {error}. העסקה תישמר ללא ניתוח.
          </div>
        )}
        <TradeForm onSubmit={handleSubmit} loading={loading} />
      </div>
    </div>
  )
}
