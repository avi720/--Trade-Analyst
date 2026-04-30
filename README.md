# Trade Analysis

יומן מסחר חכם עם AI — Next.js 14 + Supabase + IBKR + Polygon

## הרצה מקומית

```bash
npm install
npm run dev   # http://localhost:3000
```

### דרישות מוקדמות

1. **Supabase** — יצור project ב-[supabase.com](https://supabase.com)
2. **חשבון משתמש** — נוצר ידנית ב-Supabase dashboard (Authentication → Users → Add User)

### Environment Variables

העתק `.env.example` ל-`.env.local` ומלא את הערכים:

| משתנה | תיאור |
|-------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL של Supabase project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key ציבורי |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-side בלבד) |
| `DATABASE_URL` | PostgreSQL URL עם pgbouncer |
| `DIRECT_URL` | PostgreSQL URL ישיר (למigrations) |
| `FLEX_TOKEN_ENCRYPTION_KEY` | 32-byte hex להצפנת Flex token |
| `POLYGON_API_KEY` | Polygon API key (Free tier) |
| `GEMINI_API_KEY` | Google Gemini API key |

**ליצירת FLEX_TOKEN_ENCRYPTION_KEY:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Deploy ל-Render

### Web Service

1. חבר את ה-GitHub repo ל-Render
2. Build Command: `npm install && npm run build`
3. Start Command: `npm run start`
4. הוסף את כל ה-env vars מ-`.env.example`
5. Environment: `Node`

### Cron Jobs (Phase 3+)

1. **IBKR Polling** — `https://your-app.onrender.com/api/cron/ibkr-sync`
2. **Polygon Prices** — `https://your-app.onrender.com/api/cron/price-update`

## שלבי פיתוח

| Phase | סטטוס | תוכן |
|-------|--------|------|
| 0 | ✅ | Planning |
| 1 | ✅ | Foundation — Next.js + Auth + Layout |
| 2 | ✅ | Models + FIFO Logic + Tests |
| 3 | ✅ | IBKR Flex Integration |
| 4 | ✅ | Polygon Price Updates |
| 5 | ✅ | Real-Time Dashboard | // canceld
| 6 | ✅ | Research Dashboard |
| 7 | ✅ | AI Chat (חנן) |
| 8 | ⬜ | Search + Polish |

## ארכיטקטורה

```
app/
├── (auth)/login/         # Login page
├── (dashboard)/
│   ├── dashboard/        # Real-time open positions
│   ├── research/         # Analytics + charts
│   ├── search/           # Trade search
│   ├── profile/          # User profile
│   └── settings/         # App settings (IBKR, Polygon, AI)
├── auth/callback/        # Supabase auth callback
└── api/
    └── cron/             # Cron job endpoints (Phase 3+)

components/               # Shared UI components
lib/
├── supabase/             # Supabase client (server + browser)
└── utils/                # Utility functions
```
