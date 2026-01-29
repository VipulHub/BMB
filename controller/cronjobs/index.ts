// ==========================
// CRON STARTER

import { processFailedJobsBatch } from "./delhiveryOne.ts";
const WORKER_ID = `retry-worker-${process.pid}`;
import cron from "node-cron";

// ==========================
export function startFailedJobsCron() {
  // every 30 minutes
  cron.schedule("*/30 * * * *", async () => {
    console.log(
      `[CRON] retryFailedJobs started by ${WORKER_ID} at ${new Date().toISOString()}`
    );

    try {
      await processFailedJobsBatch();
    } catch (e) {
      console.error("[CRON] Unexpected error in processFailedJobsBatch:", e);
    }

    console.log(`[CRON] retryFailedJobs finished by ${WORKER_ID}`);
  });
}