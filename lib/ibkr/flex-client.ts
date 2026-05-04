import { XMLParser } from "fast-xml-parser";

// Official IBKR Flex Web Service v3 endpoint (documented at ibkrguides.com/clientportal/.../flex3.htm)
const FLEX_REQUEST_URL =
  "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/SendRequest";

// Required by IBKR — without this header the request may be rejected
const FLEX_HEADERS = { "User-Agent": "Java" };

// Transient IBKR errors — next cron run will likely succeed on its own.
// MUST stay in sync with IBKR_TRANSIENT_CODES in components/sync-indicator.tsx.
// Source: https://www.ibkrguides.com/clientportal/performanceandstatements/flex3error.htm
const IBKR_TRANSIENT_CODES = new Set([
  "1001", // Statement could not be generated at this time
  "1004", // Statement is incomplete at this time
  "1005", // Settlement data is not ready
  "1006", // FIFO P/L data is not ready
  "1007", // MTM P/L data is not ready
  "1008", // MTM and FIFO P/L data is not ready
  "1009", // Server under heavy load
  "1017", // Reference code is invalid (step-2 code expired; fresh code next run)
  "1018", // Too many requests (rate limit; next run will be fine)
  "1019", // Statement generation in progress
  "1021", // Statement could not be retrieved at this time
]);

/**
 * Thrown when IBKR returns a transient "not ready yet" error.
 * The cron route uses this to skip updating lastSyncAt so the next
 * scheduled fire retries without waiting the full polling interval.
 */
export class IbkrTransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IbkrTransientError";
  }
}

interface FlexStep1Response {
  referenceCode: string;
  url: string;
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

function throwIbkrError(errorCode: string, errorMessage: string): never {
  const msg = `IBKR Flex (${errorCode}): ${errorMessage}`;
  if (IBKR_TRANSIENT_CODES.has(errorCode)) {
    throw new IbkrTransientError(msg);
  }
  throw new Error(msg);
}

function parseStep1Xml(xml: string): FlexStep1Response {
  const doc = parser.parse(xml);

  // IBKR uses FlexStatementResponse for Step 1.
  // On error it still wraps in FlexStatementResponse but sets Status=Fail +
  // ErrorCode + ErrorMessage instead of ReferenceCode + Url.
  // Older SDK versions use FlexStatementOperationMessage for errors.
  const body = doc?.FlexStatementResponse ?? doc?.FlexStatementOperationMessage;

  if (!body) {
    throw new Error(`Unexpected Flex response format: ${xml.slice(0, 300)}`);
  }

  const status = String(body.Status ?? body.status ?? "");
  if (status === "Fail") {
    const code = String(body.ErrorCode ?? body.errorCode ?? "unknown");
    const msg = String(body.ErrorMessage ?? body.errorMessage ?? `error code ${code}`);
    throwIbkrError(code, msg);
  }

  const referenceCode = body.ReferenceCode ?? body.referenceCode;
  const url = body.Url ?? body.url;
  if (!referenceCode || !url) {
    throw new Error(`Missing ReferenceCode or Url in Flex response: ${xml.slice(0, 200)}`);
  }
  return { referenceCode: String(referenceCode), url: String(url) };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Executes a 2-step Flex Web Service fetch and returns raw XML.
// Retries step 2 if the statement is still being generated.
export async function fetchFlexQuery(token: string, queryId: string): Promise<string> {
  // Step 1 — request reference code
  const step1Url = `${FLEX_REQUEST_URL}?t=${encodeURIComponent(token)}&q=${encodeURIComponent(queryId)}&v=3`;
  const step1Res = await fetch(step1Url, { headers: FLEX_HEADERS });
  if (!step1Res.ok) {
    throw new Error(`Flex step 1 HTTP error ${step1Res.status}`);
  }
  const step1Xml = await step1Res.text();
  const { referenceCode, url } = parseStep1Xml(step1Xml);

  // Step 2 — download the report (retry if not ready yet)
  // IBKR can take 30–120 seconds to generate a statement; poll every 10s up to 2 minutes.
  const step2Url = `${url}?q=${encodeURIComponent(referenceCode)}&t=${encodeURIComponent(token)}&v=3`;
  const MAX_RETRIES = 12;
  const RETRY_DELAY_MS = 10_000;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const step2Res = await fetch(step2Url, { headers: FLEX_HEADERS });
    if (!step2Res.ok) {
      throw new Error(`Flex step 2 HTTP error ${step2Res.status}`);
    }
    const xml = await step2Res.text();

    // IBKR returns a specific message while the statement is being prepared
    if (xml.includes("Statement generation in progress")) {
      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      // Still generating after ~2 minutes — treat as transient so lastSyncAt is not updated
      // and the next scheduled cron run retries automatically.
      throw new IbkrTransientError("Flex statement generation timed out after retries");
    }

    // Check for error codes in the step-2 response as well
    if (xml.includes("<ErrorCode>") || xml.includes("FlexStatementOperationMessage")) {
      const doc = parser.parse(xml);
      const root = doc?.FlexStatementOperationMessage ?? doc?.FlexStatementResponse;
      if (root) {
        const status = String(root.Status ?? root.status ?? "");
        const errorCode = String(root.ErrorCode ?? root.errorCode ?? "");
        const errorMsg = String(root.ErrorMessage ?? root.errorMessage ?? `error code ${errorCode}`);
        if (errorCode && errorCode !== "0" && status === "Fail") {
          throwIbkrError(errorCode, errorMsg);
        }
      }
    }

    return xml;
  }

  throw new Error("Flex fetch failed after maximum retries");
}
