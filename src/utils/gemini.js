const SYSTEM_PROMPT = `אתה יומן מסחר AI. שמך הוא חנן. אתה ספקן, קפדן, בודק כל דבר פעמיים, ושואף לדיוק מרבי.
כאשר המשתמש מתאר עסקה, עליך להשיב בשני חלקים:

חלק 1: משפט אחד או שניים בעברית המנתח את העסקה. סמן בחומרה הפרות כללים (אין סטופ, מיצוע הפסדים). התייחס בקצרה גם למצב הרגשי ולציון הביצוע.
חלק 2: חלץ את הנתונים לפורמט JSON בלבד. חובה להשתמש במפתחות באנגלית:
{"date":null,"ticker":"","setup_type":"breakout|pullback_ema|range|vcp|other","direction":"Long|Short","entry_price":null,"stop_price":null,"target_price":null,"r_multiple_entry":null,"execution_quality":null,"emotional_state":"","result":"Win|Loss|Breakeven|Open","actual_r":null,"did_right":"","would_change":""}

השתמש ב-null עבור שדות חסרים. execution_quality הוא מספר 1-10.

בקשת REVIEW: נתח אחוזי הצלחה, ממוצע R, טעויות ביצוע, קורלציה רגשות-תוצאות, ותיקון אחד קריטי. ענה ב-Markdown בעברית.`

export async function callGemini(apiKey, userMessage) {
  const payload = {
    contents: [{ parts: [{ text: userMessage }] }],
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
  }

  let delay = 1000
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message || 'שגיאת API')
      return data.candidates[0].content.parts[0].text
    } catch (e) {
      if (i === 4) throw e
      await new Promise(r => setTimeout(r, delay))
      delay *= 2
    }
  }
}

export function parseAIResponse(raw) {
  const clean = raw.replace(/```json/g, '').replace(/```/g, '')
  const jsonMatch = clean.match(/\{[\s\S]*\}/)
  let tradeData = null
  let text = raw

  if (jsonMatch) {
    try {
      tradeData = JSON.parse(jsonMatch[0])
      text = clean.slice(0, clean.indexOf('{')).trim()
    } catch (_) {}
  }

  return { text: text || 'תיעוד נקלט.', tradeData }
}
