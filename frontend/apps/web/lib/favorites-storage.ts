const FAVORITES_STORAGE_KEY = "tp:favorite-materials";
export const FAVORITES_UPDATED_EVENT = "tp:favorites-updated";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readFavoriteMaterialIds(): string[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

export function writeFavoriteMaterialIds(ids: string[]) {
  if (!canUseStorage()) return;
  const uniqueIds = Array.from(new Set(ids));
  window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(uniqueIds));
  window.dispatchEvent(new Event(FAVORITES_UPDATED_EVENT));
}
