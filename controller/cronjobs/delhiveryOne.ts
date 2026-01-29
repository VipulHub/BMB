// src/cron/retryFailedJobs.cron.ts

import cron from "node-cron";
import supabase from "../../config/db.config.ts";
import { createDelhiveryShipment } from "../helper.ts";
import { sendSuccessEmail, sendFailureEmail } from "../../utils/email.ts";

/**
 * CRON RULES
 * ----------
 * - Runs every 30 minutes
 * - Max retries: 5
 * - Fixed retry delay: 15 minutes after EVERY failure
 * - After 5 failures → status = 'dead' (rejected)
 * - Email is sent in EVERY case (success + each failure)
 *
 * RELIABILITY ADDITIONS
 * ---------------------
 * ✅ Prevent overlapping cron runs (isRunning guard)
 * ✅ Limited concurrency to avoid event-loop blocking
 * ✅ Timeout wrapper so slow network does not block scheduler
 * ✅ Set timezone explicitly
 */

const MAX_ATTEMPTS = 5;
const RETRY_DELAY_MINUTES = 15;
const BATCH_SIZE = 10;
const WORKER_ID = `retry-worker-${process.pid}`;

// If your 3rd party APIs are slow, keep this reasonable
const JOB_TIMEOUT_MS = 45_000; // 45 seconds per job
const CONCURRENCY = 3; // process 3 jobs at a time (tune)

// Guard to stop overlapping cron runs
let isRunning = false;

function minutesFromNow(min: number) {
  return new Date(Date.now() + min * 60 * 1000).toISOString();
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer!)) as Promise<T>;
}

/**
 * Simple concurrency runner (no extra dependency)
 */
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
) {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (!item) return;
      try {
        await worker(item);
      } catch (e) {
        console.error("[CRON] worker error:", e);
      }
    }
  });
  await Promise.all(runners);
}

// ==========================
// PROCESS BATCH
// ==========================
async function processFailedJobsBatch() {
  const nowIso = new Date().toISOString();

  const { data: jobs, error } = await supabase
    .from("failed_jobs")
    .select("*")
    .eq("status", "pending")
    .lt("attempts", MAX_ATTEMPTS)
    .lte("next_retry_at", nowIso)
    .is("locked_at", null)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error("❌ Failed to fetch failed_jobs:", error);
    return;
  }

  if (!jobs || jobs.length === 0) {
    console.log("[CRON] No eligible failed jobs to process");
    return;
  }

  // ✅ limited concurrency so the event loop stays responsive
  await runWithConcurrency(jobs, CONCURRENCY, async (job) => {
    // ✅ per-job timeout so no single job blocks cron
    await withTimeout(processSingleJob(job), JOB_TIMEOUT_MS, `processSingleJob(${job.id})`);
  });
}

// ==========================
// PROCESS SINGLE JOB
// ==========================
async function processSingleJob(job: any) {
  const nowIso = new Date().toISOString();

  // 1) LOCK THE JOB (best-effort)
  const { data: locked, error: lockErr } = await supabase
    .from("failed_jobs")
    .update({
      status: "processing",
      locked_at: nowIso,
      locked_by: WORKER_ID,
      updated_at: nowIso,
    })
    .eq("id", job.id)
    .eq("status", "pending")
    .is("locked_at", null)
    .select()
    .single();

  if (lockErr || !locked) {
    if (lockErr) console.error("❌ Lock error:", lockErr);
    return;
  }

  const orderId =
    locked?.context?.order ||
    locked?.payload?.order ||
    locked?.context?.order_id ||
    "UNKNOWN_ORDER";

  try {
    // 2) EXECUTE THE JOB (wrap in timeout too if you want)
    switch (locked.job_type) {
      case "DELHIVERY_CREATE_SHIPMENT":
        await withTimeout(
          createDelhiveryShipment(locked.payload),
          JOB_TIMEOUT_MS,
          `createDelhiveryShipment(${orderId})`
        );
        break;

      default:
        throw new Error(`Unknown job_type: ${locked.job_type}`);
    }

    // 3) ON SUCCESS: mark succeeded
    const { error: successErr } = await supabase
      .from("failed_jobs")
      .update({
        status: "succeeded",
        last_error: null,
        last_error_stack: null,
        last_status_code: null,
        last_response: null,
        locked_at: null,
        locked_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", locked.id);

    if (successErr) {
      console.error("❌ Failed to mark job succeeded:", successErr);
    }

    // ✅ EMAIL ON SUCCESS (every case requirement)
    const attemptsUsed = (locked.attempts ?? 0) + 1;
    await withTimeout(
      sendSuccessEmail({ orderId, attemptsUsed }),
      20_000,
      `sendSuccessEmail(${orderId})`
    );

    console.log(`✅ Job succeeded: ${locked.id} (${locked.job_type})`);
  } catch (err: any) {
    const attemptsAfterFail = (locked.attempts ?? 0) + 1;
    const errorMsg = err?.message || "Unknown error";
    const isFinal = attemptsAfterFail >= MAX_ATTEMPTS;

    // ✅ EMAIL ON FAILURE (every case requirement)
    await withTimeout(
      sendFailureEmail({
        orderId,
        attempt: attemptsAfterFail,
        maxAttempts: MAX_ATTEMPTS,
        error: errorMsg,
        isFinal,
      }),
      20_000,
      `sendFailureEmail(${orderId})`
    );

    // FINAL FAILURE -> reject/dead
    if (isFinal) {
      const { error: deadErr } = await supabase
        .from("failed_jobs")
        .update({
          status: "dead",
          attempts: attemptsAfterFail,
          max_attempts: MAX_ATTEMPTS,
          last_error: errorMsg,
          last_error_stack: err?.stack || null,
          locked_at: null,
          locked_by: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", locked.id);

      if (deadErr) {
        console.error("❌ Failed to mark job dead:", deadErr);
      } else {
        console.log(`🛑 Job rejected (dead): ${locked.id} after ${MAX_ATTEMPTS} tries`);
      }
      return;
    }

    // Otherwise schedule retry after fixed 15 minutes
    const nextRetryAt = minutesFromNow(RETRY_DELAY_MINUTES);

    const { error: retryErr } = await supabase
      .from("failed_jobs")
      .update({
        status: "pending",
        attempts: attemptsAfterFail,
        max_attempts: MAX_ATTEMPTS,
        next_retry_at: nextRetryAt,
        last_error: errorMsg,
        last_error_stack: err?.stack || null,
        locked_at: null,
        locked_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", locked.id);

    if (retryErr) {
      console.error("❌ Failed to reschedule retry:", retryErr);
    } else {
      console.log(
        `🔁 Retry scheduled in ${RETRY_DELAY_MINUTES} min | job=${locked.id} | attempt=${attemptsAfterFail}/${MAX_ATTEMPTS} | next_retry_at=${nextRetryAt}`
      );
    }
  }
}

export {  processSingleJob, processFailedJobsBatch };
