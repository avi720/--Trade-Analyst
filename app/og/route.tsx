import { ImageResponse } from 'next/og'

export const runtime = 'edge'

// X13: /og output is fully deterministic (no query params, no request-scoped state)
// so cache aggressively at the edge. Without this, every social-preview scrape or
// hostile request costs ~50-100ms of edge CPU on Vercel's tab.
const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
} as const

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#080808',
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Top accent bar */}
        <div
          style={{
            width: '100%',
            height: '4px',
            background: 'linear-gradient(to right, #2CC84A, #FFB800)',
            display: 'flex',
            flexShrink: 0,
          }}
        />

        {/* Main area */}
        <div
          style={{
            display: 'flex',
            flex: 1,
            flexDirection: 'row',
            padding: '60px 80px',
            gap: '60px',
          }}
        >
          {/* Left column — branding */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              flex: 1,
              gap: '0px',
            }}
          >
            {/* Wordmark */}
            <div
              style={{
                fontSize: '72px',
                fontWeight: 700,
                color: '#E0E0E0',
                letterSpacing: '-2px',
                lineHeight: 1.05,
                display: 'flex',
              }}
            >
              Trade
            </div>
            <div
              style={{
                fontSize: '72px',
                fontWeight: 700,
                color: '#2CC84A',
                letterSpacing: '-2px',
                lineHeight: 1.05,
                display: 'flex',
              }}
            >
              Analyst
            </div>

            {/* Tagline */}
            <div
              style={{
                marginTop: '24px',
                fontSize: '26px',
                color: '#888888',
                display: 'flex',
                direction: 'rtl',
              }}
            >
              יומן מסחר חכם עם AI
            </div>

            {/* Feature pills */}
            <div
              style={{
                marginTop: '36px',
                display: 'flex',
                gap: '12px',
                flexWrap: 'wrap',
              }}
            >
              {[
                { label: 'IBKR Sync', color: '#FFB800' },
                { label: 'AI חנן', color: '#2CC84A' },
                { label: 'FIFO Analytics', color: '#888888' },
              ].map((pill) => (
                <div
                  key={pill.label}
                  style={{
                    background: '#111111',
                    border: `1px solid #222222`,
                    borderRadius: '100px',
                    padding: '8px 20px',
                    color: pill.color,
                    fontSize: '17px',
                    display: 'flex',
                  }}
                >
                  {pill.label}
                </div>
              ))}
            </div>
          </div>

          {/* Right column — decorative panel */}
          <div
            style={{
              width: '360px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              justifyContent: 'center',
            }}
          >
            {/* Mini "stat cards" */}
            {[
              { label: 'Win Rate', value: '64%', color: '#2CC84A' },
              { label: 'Avg R', value: '+1.8R', color: '#2CC84A' },
              { label: 'Max DD', value: '-3.2R', color: '#FF4D4D' },
            ].map((stat) => (
              <div
                key={stat.label}
                style={{
                  background: '#111111',
                  border: '1px solid #222222',
                  borderRadius: '12px',
                  padding: '20px 24px',
                  display: 'flex',
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ color: '#888888', fontSize: '16px', display: 'flex' }}>
                  {stat.label}
                </div>
                <div
                  style={{
                    color: stat.color,
                    fontSize: '28px',
                    fontWeight: 600,
                    fontFamily: 'monospace',
                    display: 'flex',
                  }}
                >
                  {stat.value}
                </div>
              </div>
            ))}

            {/* Mini bar chart */}
            <div
              style={{
                background: '#111111',
                border: '1px solid #222222',
                borderRadius: '12px',
                padding: '16px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ color: '#888888', fontSize: '14px', display: 'flex' }}>P&amp;L / Trade</div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: '5px',
                  height: '52px',
                }}
              >
                {[40, 65, 30, 80, 55, 70, 45, 90, 60, 75, 35, 85].map((h, i) => (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: `${h}%`,
                      background: [1, 3, 7].includes(i) ? '#FF4D4D' : '#2CC84A',
                      borderRadius: '2px 2px 0 0',
                      display: 'flex',
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom strip */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            padding: '0 80px 28px',
          }}
        >
          <div
            style={{
              color: '#333333',
              fontSize: '15px',
              fontFamily: 'monospace',
              display: 'flex',
            }}
          >
            tradeanalyst.app
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: CACHE_HEADERS }
  )
}
