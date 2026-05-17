import twilio, { Twilio } from "twilio";

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
});

// ─── Twilio error codes worth handling explicitly ─────────────────────────────
// https://www.twilio.com/docs/api/errors

const TWILIO_AUTH_ERROR_CODES = new Set([20003, 20008]);
const TWILIO_INVALID_NUMBER_CODES = new Set([21211, 21614, 63032]);
const TWILIO_RATE_LIMIT_CODE = 429;

// ─── Typed error ─────────────────────────────────────────────────────────────

export class WhatsAppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "WhatsAppError";
  }
}

// ─── Result type (no thrown errors leaking into callers) ─────────────────────

export type SendResult =
  | { ok: true; sid: string; sentAt: string }
  | { ok: false; error: WhatsAppError };

// ─── Singleton client ─────────────────────────────────────────────────────────

let _client: Twilio | null = null;

function getTwilioClient(): Twilio {
  if (_client) return _client;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new WhatsAppError(
      "TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set",
      "TWILIO_MISCONFIGURED",
      false,
    );
  }

  _client = twilio(accountSid, authToken);
  return _client;
}

// ─── WhatsApp from-number ─────────────────────────────────────────────────────

function getFromNumber(): string {
  const raw = process.env.WHATSAPP_FROM;

  if (!raw) {
    throw new WhatsAppError(
      "WHATSAPP_FROM env var is not set",
      "TWILIO_MISCONFIGURED",
      false,
    );
  }

  // Normalise: ensure the whatsapp: prefix is always present
  return raw.startsWith("whatsapp:") ? raw : `whatsapp:${raw}`;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class WhatsAppService {
  private readonly client: Twilio;
  private readonly from: string;

  constructor() {
    // Validate credentials and normalise the from-number at construction time
    // so misconfiguration is caught on startup, not at the first send.
    this.client = getTwilioClient();
    this.from = getFromNumber();
  }

  /**
   * Sends a WhatsApp message and returns a typed result.
   * Never throws — errors are returned as `{ ok: false, error }` so callers
   * can decide whether to retry, log, or surface to the user.
   */
  async send(phoneNumber: string, message: string): Promise<SendResult> {
    const to = phoneNumber.startsWith("whatsapp:")
      ? phoneNumber
      : `whatsapp:${phoneNumber}`;

    console.log(to, this.from);

    try {
      const response = await this.client.messages.create({
        from: this.from,
        to,
        body: message,
      });

      console.info("[WhatsAppService] Message sent", {
        sid: response.sid,
        to,
        status: response.status,
      });

      return {
        ok: true,
        sid: response.sid,
        sentAt: new Date().toISOString(),
      };
    } catch (err: any) {
      return { ok: false, error: classifyTwilioError(err) };
    }
  }
}

// ─── Error classifier ─────────────────────────────────────────────────────────

function classifyTwilioError(err: any): WhatsAppError {
  const code = err?.code as number | undefined;
  const status = err?.status as number | undefined;
  const message = err?.message ?? "Unknown Twilio error";

  if (code && TWILIO_AUTH_ERROR_CODES.has(code)) {
    return new WhatsAppError(
      `Twilio authentication failed: ${message}`,
      "TWILIO_AUTH_ERROR",
      false, // credentials won't fix themselves — don't retry
      err,
    );
  }

  if (code && TWILIO_INVALID_NUMBER_CODES.has(code)) {
    return new WhatsAppError(
      `Invalid or unregistered WhatsApp number: ${message}`,
      "INVALID_RECIPIENT",
      false, // retrying won't fix a bad number
      err,
    );
  }

  if (status === TWILIO_RATE_LIMIT_CODE) {
    return new WhatsAppError(
      `Twilio rate limit hit: ${message}`,
      "RATE_LIMITED",
      true, // safe to retry after backoff
      err,
    );
  }

  // Fallback: treat as transient/retryable
  return new WhatsAppError(
    `WhatsApp send failed: ${message}`,
    "TWILIO_UNKNOWN_ERROR",
    true,
    err,
  );
}

export default WhatsAppService;
