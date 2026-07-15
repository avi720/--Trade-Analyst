/**
 * Best-effort trigger of the GitHub-Actions AI-import worker via
 * repository_dispatch. Server-only.
 *
 * OPTIONAL: if AI_IMPORT_DISPATCH_TOKEN / AI_IMPORT_DISPATCH_REPO are not set,
 * this no-ops and the scheduled cron ("*​/5 * * * *") picks up the PENDING job
 * instead. When they ARE set, the job is processed within seconds of upload and
 * the schedule can be relaxed. Never throws — a failed dispatch must not fail
 * the upload; the cron is the safety net.
 */
export async function fireWorkerDispatch(): Promise<void> {
  const token = process.env.AI_IMPORT_DISPATCH_TOKEN
  const repo = process.env.AI_IMPORT_DISPATCH_REPO // "owner/repo"
  if (!token || !repo) return

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ event_type: 'ai-import-requested' }),
    })
    if (!res.ok) {
      console.error(`[ai-import] worker dispatch HTTP ${res.status} (falling back to cron)`)
    }
  } catch (err) {
    console.error('[ai-import] worker dispatch failed (falling back to cron):', err)
  }
}
