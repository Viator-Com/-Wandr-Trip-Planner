/**
 * Shape-agnostic result handling. Kiwi's output format may change, so nothing here
 * depends on specific field names: we find the list, drop empty values, trim noise,
 * merge duplicates across sorts, and cap total size.
 */

const LIST_KEYS = [
  "flights",
  "results",
  "itineraries",
  "options",
  "items",
  "data",
];

export interface Parsed {
  /** The list of flight options if the output was JSON, otherwise null. */
  items: any[] | null;
  /** Original text (used as a fallback when output isn't JSON). */
  text: string;
}

export function parseResult(text: string): Parsed {
  const trimmed = text.trim();
  try {
    const v = JSON.parse(trimmed);
    if (Array.isArray(v)) return { items: v, text: trimmed };
    if (v && typeof v === "object") {
      for (const k of LIST_KEYS) {
        if (Array.isArray((v as any)[k]))
          return { items: (v as any)[k], text: trimmed };
      }
      const anyList = Object.values(v).find(Array.isArray);
      if (anyList) return { items: anyList as any[], text: trimmed };
    }
  } catch {
    /* not JSON: fall through */
  }
  return { items: null, text: trimmed };
}

/** Remove null/empty values, cap long arrays and strings (URLs are kept whole). */
export function prune(v: any, depth = 0): any {
  if (v === null || v === undefined || v === "") return undefined;

  if (typeof v === "string") {
    return /^https?:\/\//i.test(v) || v.length <= 500
      ? v
      : v.slice(0, 500) + "…";
  }

  if (Array.isArray(v)) {
    const arr = v
      .slice(0, 12)
      .map((x) => prune(x, depth + 1))
      .filter((x) => x !== undefined);
    return arr.length ? arr : undefined;
  }

  if (typeof v === "object") {
    if (depth > 6) return undefined;
    const out: Record<string, any> = {};
    for (const [k, val] of Object.entries(v)) {
      const p = prune(val, depth + 1);
      if (p !== undefined) out[k] = p;
    }
    return Object.keys(out).length ? out : undefined;
  }

  return v;
}

export interface Batch {
  label: string;
  items: any[];
  take: number;
}

/** Merge top-N lists from several sorts; the same flight gets multiple labels. */
export function mergeOptions(batches: Batch[]): Array<Record<string, any>> {
  const seen = new Map<string, { item: any; labels: string[] }>();

  for (const b of batches) {
    for (const raw of b.items.slice(0, b.take)) {
      const item = prune(raw);
      if (item === undefined) continue;

      const key = JSON.stringify(item);
      const hit = seen.get(key);
      if (hit) {
        if (!hit.labels.includes(b.label)) hit.labels.push(b.label);
      } else {
        seen.set(key, { item, labels: [b.label] });
      }
    }
  }

  return [...seen.values()].map(({ item, labels }) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? { labels, ...item }
      : { labels, value: item },
  );
}

/** Drop trailing options until the serialised list fits. */
export function capSize<T>(options: T[], maxChars: number): T[] {
  const out = [...options];
  while (out.length > 1 && JSON.stringify(out).length > maxChars) out.pop();
  return out;
}

export const truncate = (s: string, max: number) =>
  s.length > max ? s.slice(0, max) + "…[truncated]" : s;
