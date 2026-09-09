import { closeDb, db } from "@/db";
import { config } from "@/domain/config";
import { closeTransports } from "@/domain/delivery";
import { drainOnce } from "@/domain/sender";
import { purgeExpired } from "@/domain/sessions";

/**
 * The background sender (§4.1).
 *
 * A separate process, like the SMTP listener, so it can be deployed and scaled
 * on its own - and so a crash while talking to a provider cannot take the web
 * application down with it.
 *
 * It holds no state of its own: every pass re-reads what is `ready` and
 * eligible, which is what lets it be stopped, restarted or run as more than
 * one instance without losing or duplicating work. The eligibility rules -
 * provider assigned, owner not suspended, attempts under the cap - all live in
 * the domain query it calls.
 */

let running = true;
let inFlight: Promise<unknown> = Promise.resolve();

// A plain timer, deliberately not unref'd: better-sqlite3 is synchronous and
// holds no handle, so an unref'd wait would let the event loop empty and the
// worker exit after its first pass - silently, looking exactly like a sender
// that has nothing to do.
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const pass = async (): Promise<void> => {
  try {
    const { attempted, sent } = await drainOnce();
    if (attempted > 0) {
      console.info(`[sender] attempted ${attempted}, sent ${sent}`);
    }
  } catch (error) {
    // A failure here is the loop's, not an email's - individual send failures
    // are recorded against their email and never reach this catch.
    console.error("[sender] pass failed:", error);
  }
};

const shutdown = async (signal: string): Promise<void> => {
  if (!running) return;
  running = false;
  console.info(`[sender] ${signal} - finishing the email at hand, then stopping`);

  // "In-flight background batches finish the email at hand, nothing further is
  // picked up" (§6).
  await inFlight;
  await closeTransports();
  closeDb();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

const main = async (): Promise<void> => {
  // Touch the database up front: a sender that cannot reach its store should
  // fail loudly at start, not silently do nothing every five seconds.
  db().prepare("SELECT 1").get();

  console.info(
    `[sender] draining every ${config.sender.intervalMs}ms, ` +
      `batches of ${config.sender.batchSize}, ${config.sender.maxAttempts} attempts max`,
  );

  let sinceCleanup = 0;
  while (running) {
    inFlight = pass();
    await inFlight;

    // Expired sessions are nobody's job in particular; the sender is already
    // awake on a timer, so it does the sweep.
    if ((sinceCleanup += config.sender.intervalMs) >= 3_600_000) {
      sinceCleanup = 0;
      purgeExpired();
    }

    if (running) await sleep(config.sender.intervalMs);
  }
};

void main();
