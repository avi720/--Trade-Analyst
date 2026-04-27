import { XMLParser } from "fast-xml-parser";

const FLEX_REQUEST_URL =
  "https://www.interactivebrokers.com/Universal/servlet/FlexStatementService.SendRequest";

// Maps IBKR error codes to human-readable messages
const IBKR_ERROR_MESSAGES: Record<string, string> = {
  "1001": "Token is invalid",
  "1002": "Token has expired",
  "1003": "No statement found for the query",
  "1004": "Statement is not available yet",
  "1005": "Too many requests — wait before retrying",
  "1006": "Query ID is invalid",
  "1007": "Service is temporarily unavailable",
};

interface FlexStep1Response {
  referenceCode: string;
  url: string;
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

function parseStep1Xml(xml: string): FlexStep1Response {
  const doc = parser.parse(xml);

  // IBKR uses FlexStatementResponse for successful Step 1 responses
  // and FlexStatementOperationMessage for errors
  const success = doc?.FlexStatementResponse;
  const error = doc?.FlexStatementOperationMessage;

  if (error) {
    const errorCode = error.ErrorCode ?? error.errorCode;
    if (errorCode && String(errorCode) !== "0") {
      const msg = IBKR_ERROR_MESSAGES[String(errorCode)] ?? `IBKR error code ${errorCode}`;
      throw new Error(`IBKR Flex error: ${msg}`);
    }
  }

  if (!success) {
    throw new Error(`Unexpected Flex response format: ${xml.slice(0, 300)}`);
  }

  const referenceCode = success.ReferenceCode ?? success.referenceCode;
  const url = success.Url ?? success.url;
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
  const step1Res = await fetch(step1Url);
  if (!step1Res.ok) {
    throw new Error(`Flex step 1 HTTP error ${step1Res.status}`);
  }
  const step1Xml = await step1Res.text();
  const { referenceCode, url } = parseStep1Xml(step1Xml);

  // Step 2 — download the report (retry if not ready yet)
  const step2Url = `${url}?q=${encodeURIComponent(referenceCode)}&t=${encodeURIComponent(token)}&v=3`;
  const MAX_RETRIES = 5;
  const RETRY_DELAY_MS = 2000;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const step2Res = await fetch(step2Url);
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
      throw new Error("Flex statement generation timed out after retries");
    }

    // Check for error codes in the step-2 response as well
    if (xml.includes("<ErrorCode>") || xml.includes("FlexStatementOperationMessage")) {
      const doc = parser.parse(xml);
      const root = doc?.FlexStatementOperationMessage;
      if (root) {
        const errorCode = root.ErrorCode ?? root.errorCode;
        if (errorCode && String(errorCode) !== "0") {
          const msg = IBKR_ERROR_MESSAGES[String(errorCode)] ?? `IBKR error code ${errorCode}`;
          throw new Error(`IBKR Flex error: ${msg}`);
        }
      }
    }

    return xml;
  }

  throw new Error("Flex fetch failed after maximum retries");
}
