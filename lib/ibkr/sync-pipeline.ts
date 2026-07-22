import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptToken } from '@/lib/ibkr/encrypt'
import { fetchFlexQuery, IbkrTransientError } from '@/lib/ibkr/flex-client'
import { parseActivityXml } from '@/lib/ibkr/parse-flex-xml'
import { processExecutions } from '@/lib/ibkr/process-executions'
import { redactUserId } from '@/lib/log/redact'
import type { Database } from '@/lib/db/types'

type Admin = SupabaseClient<Database>

export interface ConnectionRow {
  id: string
  userId: string
  flexTokenEncrypted: string
  flexQueryIdActivity: string
}

export interface ConnectionResult {
  connectionId: string
  userId: string
  status: 'SUCCESS' | 'ERROR' | 'TRANSIENT_ERROR'
  error: string | null
  executions: number
  failedExecutions: number
}

// Full IBKR Flex fetch + parse + processExecutions + BrokerEvent audit +
// BrokerConnection status update for one connection. Shared by the
// scheduled cron ([app/api/cron/ibkr-sync/route.ts]) and the on-demand
// admin trigger ([app/api/admin/ibkr/[connectionId]/sync/route.ts]).
//
// Extracted verbatim from the cron route in Phase 3 of the admin
// rollout — no behavior change; the cron becomes a thin caller.
export async function syncOneConnection(
  admin: Admin,
  conn: ConnectionRow,
): Promise<ConnectionResult> {
  let syncStatus: 'SUCCESS' | 'ERROR' = 'SUCCESS'
  let syncError: string | null = null
  let executions = 0
  let failedExecutions = 0

  try {
    console.log(
      `[sync-pipeline] user=${redactUserId(conn.userId)} queryId=${conn.flexQueryIdActivity} starting`,
    )

    const token = decryptToken(conn.flexTokenEncrypted)
    const xml = await fetchFlexQuery(token, conn.flexQueryIdActivity)
    console.log(
      `[sync-pipeline] user=${redactUserId(conn.userId)} fetchFlexQuery complete. xml.length=${xml.length}`,
    )

    // Audit log — store raw XML (capped)
    const { data: event } = await admin
      .from('BrokerEvent')
      .insert({
        userId: conn.userId,
        source: 'IBKR_FLEX',
        eventType: 'FLEX_FETCH',
        rawPayload: { xml: xml.slice(0, 10000) },
        processingStatus: 'PENDING',
      })
      .select('id')
      .single()

    const parsed = parseActivityXml(xml)
    executions = parsed.length
    console.log(
      `[sync-pipeline] user=${redactUserId(conn.userId)} parseActivityXml: ${executions} executions`,
    )

    const results = await processExecutions(parsed, conn.userId)

    const failed = results.filter(r => r.status === 'FAILED')
    failedExecutions = failed.length
    if (failed.length > 0) {
      syncStatus = 'ERROR'
      syncError = `${failed.length} execution(s) failed. First: ${failed[0].error}`
    }

    if (event) {
      await admin
        .from('BrokerEvent')
        .update({
          processingStatus: syncStatus === 'ERROR' ? 'ERROR' : 'PROCESSED',
          processedAt: new Date().toISOString(),
          processingError: syncError,
        })
        .eq('id', event.id)
    }

    const accountId = parsed[0]?.brokerClientAccountId ?? null

    console.log(
      `[sync-pipeline] user=${redactUserId(conn.userId)} complete: ${results.length - failed.length} success, ${failed.length} failed`,
    )

    await admin
      .from('BrokerConnection')
      .update({
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: syncStatus,
        lastSyncError: syncError,
        ...(accountId ? { accountId } : {}),
      })
      .eq('id', conn.id)

    return {
      connectionId: conn.id,
      userId: conn.userId,
      status: syncStatus,
      error: syncError,
      executions,
      failedExecutions,
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(
      `[sync-pipeline] user=${redactUserId(conn.userId)} error:`,
      errMsg,
    )

    // Transient IBKR errors (report not ready yet): don't update lastSyncAt so
    // the next cron fire retries without waiting the full polling interval.
    const isTransient = err instanceof IbkrTransientError
    await admin
      .from('BrokerConnection')
      .update({
        ...(isTransient ? {} : { lastSyncAt: new Date().toISOString() }),
        lastSyncStatus: 'ERROR',
        lastSyncError: errMsg,
      })
      .eq('id', conn.id)

    return {
      connectionId: conn.id,
      userId: conn.userId,
      status: isTransient ? 'TRANSIENT_ERROR' : 'ERROR',
      error: errMsg,
      executions,
      failedExecutions,
    }
  }
}

// Fan out syncOneConnection across every active BrokerConnection.
// Used by the scheduled cron. Parallel dispatch — IBKR rate limits are
// per-token, so different users' syncs are independent.
export async function syncActiveConnections(
  admin: Admin,
): Promise<ConnectionResult[]> {
  const { data: conns, error: connErr } = await admin
    .from('BrokerConnection')
    .select('id, userId, flexTokenEncrypted, flexQueryIdActivity')
    .eq('isActive', true)

  if (connErr) {
    throw new Error(`Failed to load connections: ${connErr.message}`)
  }
  if (!conns || conns.length === 0) return []

  console.log(`[sync-pipeline] processing ${conns.length} active connection(s)`)

  const settled = await Promise.allSettled(
    (conns as ConnectionRow[]).map(conn => syncOneConnection(admin, conn)),
  )

  return settled.map((s, i) => {
    if (s.status === 'fulfilled') return s.value
    // syncOneConnection is expected to swallow known errors and return a
    // ConnectionResult; synthesize an ERROR result on unexpected throws.
    const conn = (conns as ConnectionRow[])[i]
    const msg = s.reason instanceof Error ? s.reason.message : String(s.reason)
    console.error(
      `[sync-pipeline] unhandled error for conn=${conn.id}:`,
      msg,
    )
    return {
      connectionId: conn.id,
      userId: conn.userId,
      status: 'ERROR',
      error: msg,
      executions: 0,
      failedExecutions: 0,
    }
  })
}
