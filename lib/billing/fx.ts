const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
const FALLBACK_USD_TO_ILS = 3.7

let cached: { rate: number; fetchedAt: number } | null = null

export async function getUsdToIlsRate(): Promise<number> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.rate
  }

  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=ILS', {
      next: { revalidate: 3600 },
    })
    if (!res.ok) throw new Error(`fx api: ${res.status}`)
    const json = (await res.json()) as { rates?: { ILS?: number } }
    const rate = json.rates?.ILS
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
      throw new Error('invalid fx rate shape')
    }
    cached = { rate, fetchedAt: Date.now() }
    return rate
  } catch (err) {
    console.error('[fx] failed to fetch USD/ILS rate, using fallback:', err)
    return FALLBACK_USD_TO_ILS
  }
}

export function formatPriceUsdWithIls(usd: number, ilsRate: number): string {
  const ils = Math.round(usd * ilsRate)
  return `$${usd.toFixed(2)} (~₪${ils})`
}
