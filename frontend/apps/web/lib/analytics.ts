type EventPayload = Record<string, unknown>;

const STORAGE_KEY = "tp_analytics_events";
const MAX_EVENTS = 200;

export function trackEvent(event: string, payload: EventPayload = {}) {
  if (typeof window === "undefined") return;
  const entry = {
    event,
    payload,
    at: new Date().toISOString(),
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const prev = raw ? (JSON.parse(raw) as unknown[]) : [];
    const next = [...prev, entry].slice(-MAX_EVENTS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore telemetry storage failures.
  }
  // Keep console output in MVP so QA can inspect event flow quickly.
  console.info("[analytics]", event, payload);
}
