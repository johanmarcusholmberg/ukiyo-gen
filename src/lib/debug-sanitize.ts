/**
 * Sanitization helpers for Provider Comparison debug logs.
 *
 * Two layers of redaction, applied in order:
 *  1) Key-name redaction — any object key matching SENSITIVE_KEY_PATTERN
 *     has its value replaced with "[redacted]".
 *  2) Value-pattern redaction — every retained string is scrubbed of
 *     common secret shapes (Bearer tokens, JWTs, sk-/api keys, URL
 *     signature params, presigned-URL credentials) via VALUE_REDACTORS.
 *
 * Designed to be conservative: regexes target shapes that are extremely
 * unlikely to appear in legitimate human-authored error text, so normal
 * messages such as "Generation failed: model returned 500" pass through
 * untouched. Repeated application is idempotent — once a value becomes
 * "[redacted]" or "Bearer [redacted]" no further substitution fires.
 */

export const REDACTED = "[redacted]";

/** Object keys whose values are always replaced wholesale. */
export const SENSITIVE_KEY_PATTERN =
  /(authorization|api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|bearer|secret|password|cookie|set-cookie|x-api-key|signature|client[_-]?secret|session|jwt|email|phone)/i;

const MAX_STRING_LEN = 2_000;

/**
 * Value-shape redactors. Each entry is applied in order. Patterns are
 * narrow on purpose — see the test file for the matrix we care about.
 */
const VALUE_REDACTORS: Array<{ re: RegExp; replace: string }> = [
  // Bearer / Token auth headers: "Authorization: Bearer xyz" or "Bearer xyz"
  // Stops at whitespace or quote so it stays inside one token.
  { re: /\b(Bearer|Token)\s+[A-Za-z0-9._~+/=-]{8,}/gi, replace: "$1 [redacted]" },
  // Basic auth
  { re: /\bBasic\s+[A-Za-z0-9+/=]{8,}/gi, replace: "Basic [redacted]" },
  // JWTs: three base64url segments separated by dots, header always starts with "ey"
  { re: /\bey[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, replace: REDACTED },
  // OpenAI-style keys: sk-, sk-proj-, sk-ant-, plus generic provider prefixes.
  // Require >=20 chars after the dash to avoid eating words like "sk-design-system".
  {
    re: /\b(sk|pk|rk|xai|gsk|claude|anthropic)-(?:proj-|ant-|live-|test-)?[A-Za-z0-9_-]{20,}/gi,
    replace: REDACTED,
  },
  // GitHub / GitLab style tokens
  { re: /\bgh[pousr]_[A-Za-z0-9]{20,}/g, replace: REDACTED },
  { re: /\bglpat-[A-Za-z0-9_-]{16,}/g, replace: REDACTED },
  // AWS access key id (kept narrow)
  { re: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/g, replace: REDACTED },
  // URL signature / token query params — only the value, keep the param name
  {
    re: /([?&](?:sig|signature|token|access_token|refresh_token|api_key|apikey|X-Amz-Signature|X-Amz-Credential|X-Amz-Security-Token|Signature)=)[^&\s"'<>]+/gi,
    replace: "$1[redacted]",
  },
];

/**
 * Apply value-pattern redaction to a single string. Idempotent: running
 * it on already-redacted output yields the same string.
 */
export function redactSecretsInString(input: string): string {
  if (typeof input !== "string" || input.length === 0) return input;
  let out = input;
  for (const { re, replace } of VALUE_REDACTORS) {
    out = out.replace(re, replace);
  }
  return out;
}

/**
 * Strip query strings + fragments from bare URLs so signed-URL tokens
 * cannot leak. Applied before value-pattern redaction.
 */
export function stripUrlSecrets(s: string): string {
  if (typeof s !== "string") return s;
  return s.replace(/\bhttps?:\/\/[^\s"'<>]+/gi, (url) => {
    const qi = url.indexOf("?");
    const hi = url.indexOf("#");
    const cut = [qi, hi].filter((i) => i >= 0).sort((a, b) => a - b)[0];
    return cut === undefined ? url : url.slice(0, cut) + "?[redacted]";
  });
}

function sanitizeString(value: string): string {
  // 1) Strip URL query strings (kills presigned-URL tokens wholesale).
  // 2) Run value-pattern redactors (catches inline bearer / jwt / sk-).
  // 3) Cap length last so the truncation marker isn't itself scrubbed.
  let cleaned = stripUrlSecrets(value);
  cleaned = redactSecretsInString(cleaned);
  if (cleaned.length > MAX_STRING_LEN) {
    cleaned = cleaned.slice(0, MAX_STRING_LEN) + `…[+${cleaned.length - MAX_STRING_LEN} chars]`;
  }
  return cleaned;
}

/**
 * Deep-clone with key-name redaction, URL token stripping, value-pattern
 * redaction, and size caps. Safe to pass arbitrary unknown values.
 */
export function sanitizeForDebug(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth-limit]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return sanitizeString(value);
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    const capped: unknown[] = value.slice(0, 50).map((v) => sanitizeForDebug(v, depth + 1));
    if (value.length > 50) capped.push(`…[+${value.length - 50} items]`);
    return capped;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(k)) {
      out[k] = REDACTED;
      continue;
    }
    out[k] = sanitizeForDebug(v, depth + 1);
  }
  return out;
}
