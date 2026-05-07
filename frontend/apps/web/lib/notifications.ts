export type InAppNotification = {
  id: string;
  title: string;
  body: string;
  tone?: "info" | "success" | "warning";
  createdAt: string;
};

const STORAGE_KEY = "tp_inapp_notifications";
const MAX_ITEMS = 30;

export function pushNotification(input: Omit<InAppNotification, "id" | "createdAt">) {
  if (typeof window === "undefined") return;
  const item: InAppNotification = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    tone: input.tone || "info",
    title: input.title,
    body: input.body,
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const prev = raw ? (JSON.parse(raw) as InAppNotification[]) : [];
    const next = [item, ...prev].slice(0, MAX_ITEMS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore persistence failures.
  }
}

export function readNotifications(): InAppNotification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as InAppNotification[]) : [];
  } catch {
    return [];
  }
}

export function dismissNotification(id: string) {
  if (typeof window === "undefined") return;
  const items = readNotifications().filter((n) => n.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}
