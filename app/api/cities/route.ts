import { NextResponse } from 'next/server'

const GOV_URL =
  'https://data.gov.il/api/3/action/datastore_search?resource_id=5c78e9fa-c2e2-4771-93ff-7f400a12f7ba&limit=1500'

export async function GET() {
  const res = await fetch(GOV_URL, { next: { revalidate: 86400 } })
  if (!res.ok) {
    return NextResponse.json({ error: 'Failed to fetch cities' }, { status: 502 })
  }
  const json = await res.json()
  const cities: string[] = (json.result?.records ?? [])
    .map((r: Record<string, string>) => (r['שם_ישוב'] ?? '').trim())
    .filter(Boolean)
    .sort((a: string, b: string) => a.localeCompare(b, 'he'))

  return NextResponse.json({ cities })
}
