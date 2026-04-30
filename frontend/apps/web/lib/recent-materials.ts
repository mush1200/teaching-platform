const STORAGE_KEY = "tp_recent_material_ids";
const MAX = 10;

function readIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

export function getRecentMaterialIds(): string[] {
  return readIds();
}

export function recordMaterialView(materialId: string): void {
  if (typeof window === "undefined" || !materialId) return;
  const prev = readIds().filter((id) => id !== materialId);
  const next = [materialId, ...prev].slice(0, MAX);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
}
