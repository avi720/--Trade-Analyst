/**
 * IBKR execution processing pipeline.
 * Runs FIFO matching and persists Trade/Order writes to Supabase.
 * Uses the service-role admin client — must only be called from server-only code paths.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { matchExecution } from "@/lib/trade/fifo";
import { validateStk } from "@/lib/ibkr/parse-flex-xml";
import { parseIbkrDate } from "@/lib/ibkr/parse-date";
import type {
  NormalizedExecution,
  OpenTradeSnapshot,
  FifoAction,
  TradeCreate,
  OrderCreate,
} from "@/types/trade";

export type ProcessingStatus =
  | "PROCESSED"
  | "SKIPPED_DUPLICATE"
  | "REJECTED_NON_STOCK"
  | "FAILED";

export interface ExecutionResult {
  brokerExecId: string;
  status: ProcessingStatus;
  error?: string;
  /** Populated for PROCESSED status — the Trade that was created or updated. */
  tradeId?: string;
}

/**
 * Thrown when a persist step detects that another concurrent writer modified
 * the same position between our read and our write (lost-update / duplicate-open
 * race). The per-execution loop catches this and retries: it re-reads the
 * current open trade and re-runs FIFO matching against the fresh state.
 */
class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

// Max attempts for the read → match → persist cycle of a single execution.
// Each retry only fires on a detected ConflictError, never on a real error.
const MAX_PERSIST_ATTEMPTS = 4;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Builds a DB-ready Order insert object (adds userId, tradeId, converts dates)
function buildOrderInsert(
  order: OrderCreate,
  tradeId: string,
  userId: string
): Record<string, unknown> {
  const raw = order.rawPayload as Record<string, unknown>;
  return {
    id: crypto.randomUUID(),
    tradeId,
    userId,
    side: order.side,
    quantity: order.quantity,
    price: order.price,
    commission: order.commission ?? 0,
    executedAt: order.executedAt.toISOString(),
    brokerExecId: order.brokerExecId,
    brokerOrderId: order.brokerOrderId ?? null,
    brokerClientAccountId: order.brokerClientAccountId ?? null,
    currency: order.currency ?? null,
    orderType: order.orderType ?? null,
    rawPayload: order.rawPayload,
    // camelCase (real IBKR) takes priority; PascalCase as fallback for test fixtures
    netCash: raw.netCash != null
      ? Number(raw.netCash)
      : raw.NetCash != null
        ? Number(raw.NetCash)
        : null,
    commissionCurrency: (raw.ibCommissionCurrency ?? raw.CommissionCurrency) as string | null ?? null,
    // orderTime: manual entries store a pre-parsed ISO string under _manualOrderTime
    // to bypass IBKR date parsing. IBKR entries use camelCase "orderTime" / PascalCase
    // "OrderTime" in "dd/MM/yyyy;HH:mm:ss TZ" format and must go through parseIbkrDate.
    orderTime: (() => {
      if (typeof raw._manualOrderTime === "string") return raw._manualOrderTime;
      const raw_ot = raw.orderTime ?? raw.OrderTime;
      if (typeof raw_ot !== "string") return null;
      const parsed = parseIbkrDate(raw_ot);
      return parsed ? parsed.toISOString() : null;
    })(),
  };
}

// Builds a DB-ready Trade insert for a new position
function buildTradeInsert(
  trade: TradeCreate,
  userId: string
): Record<string, unknown> {
  return {
    id: crypto.randomUUID(),
    userId,
    ticker: trade.ticker,
    assetType: trade.assetType,
    direction: trade.direction,
    status: trade.status,
    openedAt: trade.openedAt.toISOString(),
    avgEntryPrice: trade.avgEntryPrice,
    totalQuantity: trade.totalQuantity,
    totalQuantityOpened: trade.totalQuantityOpened,
    multiplier: trade.multiplier,
    totalCommission: trade.totalCommission,
    realizedPnl: trade.realizedPnl,
    stopPrice: trade.stopPrice ?? null,
    // Nullable fields set at user-entry time (not from broker)
    targetPrice: null,
    rMultipleEntry: null,
    actualR: null,
    avgExitPrice: null,
    closedAt: null,
    result: "Open",
    // Origin tag. Defaults to 'broker' here; the manual-entry route overrides
    // this to 'manual' afterward for any trade opened from a MANUAL-* exec.
    // Set explicitly (not via DB default) so the origin is owned by the code.
    source: "broker",
    setupType: null,
    executionQuality: null,
    emotionalState: null,
    didRight: null,
    wouldChange: null,
    notes: null,
    externalRefId: null,
    lastKnownPrice: null,
    lastPriceUpdateAt: null,
  };
}

// Processes a batch of normalized executions for a single user.
// Logs results per execution; returns summary.
export async function processExecutions(
  executions: NormalizedExecution[],
  userId: string
): Promise<ExecutionResult[]> {
  const admin = createAdminClient();
  const results: ExecutionResult[] = [];

  for (const exec of executions) {
    try {
      results.push(await processOneExecution(exec, userId, admin));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[process-executions] Failed for execId=${exec.brokerExecId}:`, msg);
      results.push({ brokerExecId: exec.brokerExecId, status: "FAILED", error: msg });
    }
  }

  return results;
}

// Processes a single execution: dedup + STK validation once, then a
// read → match → persist cycle that retries on concurrency conflicts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processOneExecution(
  exec: NormalizedExecution,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any
): Promise<ExecutionResult> {
  // 1. Duplicate check — unique constraint is on brokerExecId per user
  const { data: existingOrder } = await admin
    .from("Order")
    .select("id")
    .eq("brokerExecId", exec.brokerExecId)
    .eq("userId", userId)
    .maybeSingle();

  if (existingOrder) {
    return { brokerExecId: exec.brokerExecId, status: "SKIPPED_DUPLICATE" };
  }

  // 2. STK validation
  if (!validateStk(exec)) {
    return { brokerExecId: exec.brokerExecId, status: "REJECTED_NON_STOCK" };
  }

  // 3-5. Load open trade → FIFO match → persist. Retry on ConflictError, which
  // signals that a concurrent writer changed this position between our read and
  // our write (the request-pile-up / duplicate-open race). Each retry re-reads
  // the latest position so the re-match is correct (e.g. a racing OPEN becomes a
  // SCALE_IN on the second pass).
  let lastConflict: ConflictError | null = null;
  for (let attempt = 1; attempt <= MAX_PERSIST_ATTEMPTS; attempt++) {
    const { data: openTradeRow } = await admin
      .from("Trade")
      .select(
        "id, direction, avgEntryPrice, totalQuantity, totalQuantityOpened, totalCommission, realizedPnl, openedAt, stopPrice"
      )
      .eq("userId", userId)
      .eq("ticker", exec.ticker)
      .eq("status", "Open")
      .maybeSingle();

    const openTrade: OpenTradeSnapshot | null = openTradeRow
      ? {
          id: openTradeRow.id,
          direction: openTradeRow.direction as "Long" | "Short",
          avgEntryPrice: openTradeRow.avgEntryPrice,
          totalQuantity: openTradeRow.totalQuantity,
          totalQuantityOpened: openTradeRow.totalQuantityOpened,
          totalCommission: openTradeRow.totalCommission ?? 0,
          realizedPnl: openTradeRow.realizedPnl ?? 0,
          openedAt: new Date(openTradeRow.openedAt),
          stopPrice: openTradeRow.stopPrice ?? null,
        }
      : null;

    const action: FifoAction = matchExecution(exec, openTrade);

    try {
      const tradeId = await persistAction(action, userId, admin, openTrade?.totalQuantity ?? null);
      return { brokerExecId: exec.brokerExecId, status: "PROCESSED", tradeId };
    } catch (err) {
      // Real errors fail immediately; only concurrency conflicts retry.
      if (!(err instanceof ConflictError)) throw err;
      lastConflict = err;
      if (attempt < MAX_PERSIST_ATTEMPTS) {
        await sleep(15 * attempt); // small backoff to let the racing writer commit
      }
      // On the final attempt fall through so the loop exits to the wrapper throw.
    }
  }

  // Exhausted retries — surface as a normal failure for this execution.
  throw new Error(
    `Concurrency conflict unresolved after ${MAX_PERSIST_ATTEMPTS} attempts: ${lastConflict?.message ?? "unknown"}`
  );
}

// Postgres unique-violation SQLSTATE (raised by the partial unique index on
// open trades when a concurrent OPEN duplicates an existing open position).
const PG_UNIQUE_VIOLATION = "23505";

// Asserts that a guarded UPDATE actually matched a row. PostgREST returns the
// updated rows via .select(); an empty array means our optimistic guard
// (status='Open' + expected totalQuantity) failed → a concurrent writer won.
function assertUpdated(
  rows: unknown[] | null | undefined,
  label: string,
  tradeId: string
): void {
  if (!rows || rows.length === 0) {
    throw new ConflictError(`${label} conflict on trade ${tradeId}: position changed concurrently`);
  }
}

// Returns the tradeId of the Trade that was created or updated.
// For REVERSAL, returns the newly-opened Trade's id (the active position after the flip).
// `prevTotalQuantity` is the open position's quantity at read time; it guards the
// UPDATE paths against concurrent modification (optimistic concurrency control).
async function persistAction(
  action: FifoAction,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  prevTotalQuantity: number | null
): Promise<string> {
  switch (action.type) {
    case "OPEN": {
      const tradeInsert = buildTradeInsert(action.tradeCreate, userId);
      const { error: tradeErr } = await admin.from("Trade").insert(tradeInsert);
      if (tradeErr) {
        // The partial unique index (userId, ticker) WHERE status='Open' rejects a
        // second concurrent OPEN for the same position. Treat as a conflict so the
        // caller re-reads the now-existing open trade and re-matches (→ SCALE_IN/…).
        if (tradeErr.code === PG_UNIQUE_VIOLATION) {
          throw new ConflictError(`OPEN conflict for ${action.tradeCreate.ticker}: open position already exists`);
        }
        throw new Error(`Trade insert failed: ${tradeErr.message}`);
      }

      const orderInsert = buildOrderInsert(
        action.orderCreate,
        tradeInsert.id as string,
        userId
      );
      const { error: orderErr } = await admin.from("Order").insert(orderInsert);
      if (orderErr) throw new Error(`Order insert failed: ${orderErr.message}`);
      return tradeInsert.id as string;
    }

    case "SCALE_IN": {
      const { data: updated, error: tradeErr } = await admin
        .from("Trade")
        .update({
          avgEntryPrice: action.tradeUpdate.avgEntryPrice,
          totalQuantity: action.tradeUpdate.totalQuantity,
          totalQuantityOpened: action.tradeUpdate.totalQuantityOpened,
          totalCommission: action.tradeUpdate.totalCommission,
          realizedPnl: action.tradeUpdate.realizedPnl,
        })
        .eq("id", action.tradeId)
        .eq("status", "Open")
        .eq("totalQuantity", prevTotalQuantity)
        .select("id");
      if (tradeErr) throw new Error(`Trade update (SCALE_IN) failed: ${tradeErr.message}`);
      assertUpdated(updated, "SCALE_IN", action.tradeId);

      const orderInsert = buildOrderInsert(action.orderCreate, action.tradeId, userId);
      const { error: orderErr } = await admin.from("Order").insert(orderInsert);
      if (orderErr) throw new Error(`Order insert (SCALE_IN) failed: ${orderErr.message}`);
      return action.tradeId;
    }

    case "REDUCE": {
      const { data: updated, error: tradeErr } = await admin
        .from("Trade")
        .update({
          totalQuantity: action.tradeUpdate.totalQuantity,
          totalCommission: action.tradeUpdate.totalCommission,
          realizedPnl: action.tradeUpdate.realizedPnl,
        })
        .eq("id", action.tradeId)
        .eq("status", "Open")
        .eq("totalQuantity", prevTotalQuantity)
        .select("id");
      if (tradeErr) throw new Error(`Trade update (REDUCE) failed: ${tradeErr.message}`);
      assertUpdated(updated, "REDUCE", action.tradeId);

      const orderInsert = buildOrderInsert(action.orderCreate, action.tradeId, userId);
      const { error: orderErr } = await admin.from("Order").insert(orderInsert);
      if (orderErr) throw new Error(`Order insert (REDUCE) failed: ${orderErr.message}`);
      return action.tradeId;
    }

    case "CLOSE": {
      const u = action.tradeUpdate;
      const { data: updated, error: tradeErr } = await admin
        .from("Trade")
        .update({
          status: u.status,
          closedAt: u.closedAt?.toISOString() ?? null,
          avgExitPrice: u.avgExitPrice ?? null,
          actualR: u.actualR ?? null,
          result: u.result ?? null,
          totalQuantity: u.totalQuantity,
          totalCommission: u.totalCommission,
          realizedPnl: u.realizedPnl,
        })
        .eq("id", action.tradeId)
        .eq("status", "Open")
        .eq("totalQuantity", prevTotalQuantity)
        .select("id");
      if (tradeErr) throw new Error(`Trade update (CLOSE) failed: ${tradeErr.message}`);
      assertUpdated(updated, "CLOSE", action.tradeId);

      const orderInsert = buildOrderInsert(action.orderCreate, action.tradeId, userId);
      const { error: orderErr } = await admin.from("Order").insert(orderInsert);
      if (orderErr) throw new Error(`Order insert (CLOSE) failed: ${orderErr.message}`);
      return action.tradeId;
    }

    case "REVERSAL": {
      const { close, open } = action;
      const u = close.tradeUpdate;

      // IDs for the new trade and orders — must be assigned before the RPC call
      const closeOrderId = crypto.randomUUID();
      const newTradeId = crypto.randomUUID();
      const openOrderId = crypto.randomUUID();

      const closeOrder = {
        ...buildOrderInsert(close.orderCreate, close.tradeId, userId),
        id: closeOrderId,
      };
      const newTrade = {
        ...buildTradeInsert(open.tradeCreate, userId),
        id: newTradeId,
      };
      const openOrder = {
        ...buildOrderInsert(open.orderCreate, newTradeId, userId),
        id: openOrderId,
      };

      // Atomic: close existing trade + insert closing order + insert new trade + insert opening order
      const { error: rpcErr } = await admin.rpc("reverse_position", {
        p_close_trade_id: close.tradeId,
        p_close_status: u.status ?? "Closed",
        p_close_at: u.closedAt?.toISOString() ?? new Date().toISOString(),
        p_avg_exit_price: u.avgExitPrice ?? 0,
        p_actual_r: u.actualR ?? null,
        p_result: u.result ?? null,
        p_realized_pnl: u.realizedPnl ?? 0,
        p_total_commission: u.totalCommission ?? 0,
        p_close_order: closeOrder,
        p_new_trade: newTrade,
        p_new_order: openOrder,
      });
      if (rpcErr) {
        // The RPC guards its close UPDATE on status='Open' AND matching quantity;
        // if a concurrent writer changed the position first it raises
        // 'reverse_position_conflict'. Surface that as a retryable conflict.
        if (typeof rpcErr.message === "string" && rpcErr.message.includes("reverse_position_conflict")) {
          throw new ConflictError(`REVERSAL conflict on trade ${close.tradeId}: position changed concurrently`);
        }
        throw new Error(`reverse_position RPC failed: ${rpcErr.message}`);
      }
      // Return the newly-opened trade (the active position after the reversal)
      return newTradeId;
    }
  }
}
