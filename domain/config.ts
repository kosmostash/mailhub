/**
 * Installation settings, read once from the environment.
 *
 * MailHub is self-hosted, so every knob has a working default and an empty
 * environment still boots: the database lands in `var/mailhub.db` and system
 * mail is written to the log instead of a real MTA. What you must set for a
 * real install is `MAILHUB_SESSION_SECRET` and the `MAILHUB_SYSTEM_MAIL_*`
 * block - see `.env.example`.
 */

const str = (name: string, fallback: string): string => {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
};

const int = (name: string, fallback: number): number => {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a number, got ${JSON.stringify(value)}`);
  }
  return parsed;
};

const bool = (name: string, fallback: boolean): boolean => {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return value === "1" || value.toLowerCase() === "true";
};

const optional = (name: string): string | undefined => {
  const value = process.env[name];
  return value === undefined || value === "" ? undefined : value;
};

export const config = {
  databaseFile: str("MAILHUB_DB", "var/mailhub.db"),

  /** Signs session cookies. Rotating it signs everyone out, which is the point. */
  sessionSecret: str("MAILHUB_SESSION_SECRET", "mailhub-development-secret"),
  sessionTtlHours: int("MAILHUB_SESSION_TTL_HOURS", 24 * 14),
  /** Set false only when the hub is served over plain HTTP on a private network. */
  secureCookies: bool("MAILHUB_SECURE_COOKIES", process.env.NODE_ENV === "production"),

  /** System mail (§2.1.8) - confirmation codes and nothing else, so far. */
  systemMail: {
    from: str("MAILHUB_SYSTEM_MAIL_FROM", "MailHub <mailhub@localhost>"),
    host: optional("MAILHUB_SYSTEM_MAIL_HOST"),
    port: int("MAILHUB_SYSTEM_MAIL_PORT", 25),
    secure: bool("MAILHUB_SYSTEM_MAIL_SECURE", false),
    user: optional("MAILHUB_SYSTEM_MAIL_USER"),
    pass: optional("MAILHUB_SYSTEM_MAIL_PASS"),
  },

  /** Confirmation codes: short-lived, and throttled per account and address. */
  confirmation: {
    ttlMinutes: int("MAILHUB_CONFIRMATION_TTL_MINUTES", 15),
    maxAttempts: int("MAILHUB_CONFIRMATION_MAX_ATTEMPTS", 5),
    /** Requests allowed inside the window, per account and per recipient. */
    rateLimit: int("MAILHUB_CONFIRMATION_RATE_LIMIT", 5),
    rateWindowMinutes: int("MAILHUB_CONFIRMATION_RATE_WINDOW_MINUTES", 60),
  },

  /** The background sender (§4.1). */
  sender: {
    intervalMs: int("MAILHUB_SENDER_INTERVAL_MS", 5_000),
    batchSize: int("MAILHUB_SENDER_BATCH_SIZE", 20),
    /** After this many failed attempts the sender backs off until a human acts. */
    maxAttempts: int("MAILHUB_SENDER_MAX_ATTEMPTS", 3),
  },

  /** The SMTP ingestion listener (§3.6). */
  smtpIngest: {
    host: str("MAILHUB_SMTP_HOST", "127.0.0.1"),
    port: int("MAILHUB_SMTP_PORT", 2525),
    /** Refuse messages larger than this, in bytes. */
    maxSize: int("MAILHUB_SMTP_MAX_SIZE", 25 * 1024 * 1024),
    banner: str("MAILHUB_SMTP_BANNER", "MailHub"),
  },

  /**
   * Per-provider-type webhook signing keys, as `type=key` pairs:
   *   MAILHUB_WEBHOOK_KEYS="sendgrid=abc123,ses=def456"
   * A type with no key configured accepts unsigned events (§3.4).
   */
  webhookKeys: Object.fromEntries(
    str("MAILHUB_WEBHOOK_KEYS", "")
      .split(",")
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const at = pair.indexOf("=");
        return at < 0
          ? ([pair, ""] as const)
          : ([pair.slice(0, at).trim(), pair.slice(at + 1).trim()] as const);
      }),
  ) as Record<string, string>,
} as const;
