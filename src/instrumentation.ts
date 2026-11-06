// In-process scheduled polling for campaign monitoring (local / single-instance deployments).
// For multi-instance or serverless deployments, set MONITOR_INTERVAL_MINUTES=0 and call
// POST /api/monitor/run from an external scheduler instead.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const minutes = Number(process.env.MONITOR_INTERVAL_MINUTES ?? 15);
  if (!Number.isFinite(minutes) || minutes <= 0) return;
  const g = globalThis as unknown as { __promisureMonitor?: NodeJS.Timeout };
  if (g.__promisureMonitor) return;
  let running = false;
  g.__promisureMonitor = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const { runMonitoringCycle } = await import("./lib/monitoring/monitor");
      const s = await runMonitoringCycle("SCHEDULED");
      console.log(`[monitor] ${s.changedProducts.length} changed products, ${s.rechecked.length} campaigns re-checked, ${s.statusChanges} status changes`);
    } catch (e) {
      console.error("[monitor] cycle failed", e);
    } finally {
      running = false;
    }
  }, minutes * 60_000);
  console.log(`[monitor] scheduled polling every ${minutes} minute(s)`);
}
