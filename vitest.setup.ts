import '@testing-library/jest-dom'
import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env.local for integration tests (Supabase URL + service-role key).
config({ path: resolve(__dirname, '.env.local') })
