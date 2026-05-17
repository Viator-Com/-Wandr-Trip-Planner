import { BrevoClient, BrevoError } from "@getbrevo/brevo";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
});

// ─── Brevo HTTP status codes worth handling explicitly ────────────────────────
// https://developers.brevo.com/docs/api-errors

const BREVO_AUTH_STATUS = 401;
const BREVO_FORBIDDEN_STATUS = 403;
const BREVO_RATE_LIMIT_STATUS = 429;
const BREVO_BAD_REQUEST_STATUS = 400; // includes invalid recipient

// ─── Typed error ──────────────────────────────────────────────────────────────

export class EmailError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "EmailError";
  }
}

// ─── Result type (no thrown errors leaking into callers) ──────────────────────

export type SendResult =
  | { ok: true; messageId: string; sentAt: string }
  | { ok: false; error: EmailError };

// ─── Singleton Brevo client ───────────────────────────────────────────────────

let _client: BrevoClient | null = null;

function getBrevoClient(): BrevoClient {
  if (_client) return _client;

  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    throw new EmailError(
      "BREVO_API_KEY must be set",
      "EMAIL_MISCONFIGURED",
      false,
    );
  }

  // BrevoClient is the unified SDK entry point — access all APIs via getters
  // e.g. client.transactionalEmails.sendTransacEmail(...)
  _client = new BrevoClient({ apiKey });

  return _client;
}

// ─── From address ─────────────────────────────────────────────────────────────

function getFromAddress(): { email: string; name?: string } {
  const raw = process.env.EMAIL_FROM;

  if (!raw) {
    throw new EmailError(
      "EMAIL_FROM env var is not set",
      "EMAIL_MISCONFIGURED",
      false,
    );
  }

  // Support both "foo@bar.com" and '"Display Name" <foo@bar.com>' formats
  const match = raw.match(/^"?([^"<]+)"?\s*<([^>]+)>$/);
  if (match) {
    return { name: match[1].trim(), email: match[2].trim() };
  }

  return { email: raw.trim() };
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class EmailService {
  private readonly client: BrevoClient;
  private readonly from: { email: string; name?: string };

  constructor() {
    // Validate config at construction time so misconfiguration is caught on
    // startup, not at the first send — same pattern as WhatsAppService.
    this.client = getBrevoClient();
    this.from = getFromAddress();
  }

  /**
   * Sends a transactional email via Brevo and returns a typed result.
   * Never throws — errors are returned as `{ ok: false, error }` so callers
   * can decide whether to retry, log, or surface to the user.
   */
  async send(
    toAddress: string,
    subject: string,
    body: string,
  ): Promise<SendResult> {
    try {
      const response = await this.client.transactionalEmails.sendTransacEmail({
        sender: this.from,
        to: [{ email: toAddress }],
        subject,
        textContent: body,
        // htmlContent: body, // uncomment to send HTML instead
      });

      // The new SDK returns the response body directly (no .body wrapper)
      const messageId = response?.messageId ?? "unknown";

      console.info("[EmailService] Message sent via Brevo", {
        messageId,
        to: toAddress,
      });

      return {
        ok: true,
        messageId,
        sentAt: new Date().toISOString(),
      };
    } catch (err: any) {
      return { ok: false, error: classifyBrevoError(err) };
    }
  }
}

// ─── Error classifier ─────────────────────────────────────────────────────────

function classifyBrevoError(err: any): EmailError {
  // BrevoError is the SDK's typed HTTP error — status lives on err.statusCode
  const status: number | undefined =
    err instanceof BrevoError
      ? err.statusCode
      : (err?.statusCode ?? err?.status);

  const message: string =
    (err instanceof BrevoError
      ? (err.body as { message?: string })?.message
      : undefined) ??
    err?.message ??
    "Unknown Brevo error";

  if (status === BREVO_AUTH_STATUS || status === BREVO_FORBIDDEN_STATUS) {
    return new EmailError(
      `Brevo authentication failed: ${message}`,
      "EMAIL_AUTH_ERROR",
      false, // credentials won't fix themselves — don't retry
      err,
    );
  }

  if (status === BREVO_BAD_REQUEST_STATUS) {
    return new EmailError(
      `Invalid email request (bad recipient or payload): ${message}`,
      "INVALID_RECIPIENT",
      false, // retrying won't fix a bad address or malformed request
      err,
    );
  }

  if (status === BREVO_RATE_LIMIT_STATUS) {
    return new EmailError(
      `Brevo rate limit hit: ${message}`,
      "RATE_LIMITED",
      true, // safe to retry after backoff
      err,
    );
  }

  // 5xx or network errors — transient, worth retrying
  if (!status || status >= 500) {
    return new EmailError(
      `Brevo server error: ${message}`,
      "EMAIL_SERVER_ERROR",
      true,
      err,
    );
  }

  // Fallback
  return new EmailError(
    `Email send failed: ${message}`,
    "EMAIL_UNKNOWN_ERROR",
    true,
    err,
  );
}

export default EmailService;
