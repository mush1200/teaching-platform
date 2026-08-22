"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Admin 清單頁共用的 **URL-backed 狀態**（Epic §6 / §13）。
 *
 * ## URL 是唯一 source of truth
 *
 * 篩選、搜尋、頁碼、每頁筆數全部住在 query string，沒有平行的 `useState`。
 * 因此 deep link、重新整理、上一頁／下一頁、書籤在四個清單頁都是同一套行為，
 * 也不可能出現「畫面顯示第 3 頁但 API 收到第 1 頁」這種兩份狀態不同步的問題。
 *
 * ## 換篩選／換搜尋一定要重設頁碼
 *
 * 停在第 5 頁時把篩選換成一個只有 2 頁的狀態，會拿到一個空清單，
 * 而畫面上什麼都沒說 —— 使用者只會覺得「資料不見了」。
 * `setFilter` / `setSearch` 因此一律把 `page` 移除；只有 `setPage` 會設定它。
 *
 * ## 預設值不進 URL
 *
 * 等於預設值的參數會從 query string 移除，`/admin/materials?status=pending_review`
 * 才不會變成 `?status=pending_review&page=1&limit=20&q=`。
 * 少了這一步，「複製網址給同事」會傳出一串雜訊。
 */

export type ListQueryConfig = {
  /** `status` 的預設值；等於它時不寫進 URL。 */
  defaultFilter: string;
  /** 允許的 `status` 值；不在其中的一律 fallback 成預設值，且**不會**送到 API。 */
  allowedFilters: readonly string[];
  defaultPageSize?: number;
  /** filter 參數名稱，預設 `status`。 */
  filterKey?: string;
};

export type ListQueryState = {
  filter: string;
  search: string;
  page: number;
  pageSize: number;
  setFilter: (next: string) => void;
  setSearch: (next: string) => void;
  setPage: (next: number) => void;
  setPageSize: (next: number) => void;
  /** 目前狀態序列化成 API query string（不含前導 `?`）。 */
  toApiQuery: (extra?: Record<string, string | number | undefined>) => string;
};

const DEFAULT_PAGE_SIZE = 20;

export function useListQueryState(basePath: string, config: ListQueryConfig): ListQueryState {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filterKey = config.filterKey ?? "status";
  const defaultPageSize = config.defaultPageSize ?? DEFAULT_PAGE_SIZE;

  const filter = useMemo(() => {
    const raw = searchParams?.get(filterKey) ?? "";
    return config.allowedFilters.includes(raw) ? raw : config.defaultFilter;
  }, [searchParams, filterKey, config.allowedFilters, config.defaultFilter]);

  const search = useMemo(() => (searchParams?.get("q") ?? "").trim(), [searchParams]);

  const page = useMemo(() => {
    const raw = Number.parseInt(searchParams?.get("page") ?? "1", 10);
    return Number.isFinite(raw) && raw >= 1 ? raw : 1;
  }, [searchParams]);

  const pageSize = useMemo(() => {
    const raw = Number.parseInt(searchParams?.get("limit") ?? "", 10);
    // 上限與 Backend 的 `MAX_LIMIT` 一致；超過只會被靜默改小，不如在這裡就擋掉。
    if (!Number.isFinite(raw) || raw < 1 || raw > 100) return defaultPageSize;
    return raw;
  }, [searchParams, defaultPageSize]);

  const push = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      mutate(params);
      // 預設值不留在 URL。
      if (params.get(filterKey) === config.defaultFilter) params.delete(filterKey);
      if (!params.get("q")) params.delete("q");
      if (params.get("page") === "1") params.delete("page");
      if (params.get("limit") === String(defaultPageSize)) params.delete("limit");
      const qs = params.toString();
      // `replace` 而非 `push`：切換篩選不該在瀏覽器歷史堆出一長串條目
      // （沿用 `/admin/orders` 既有的作法）。
      router.replace(qs ? `${basePath}?${qs}` : basePath);
    },
    [router, searchParams, basePath, filterKey, config.defaultFilter, defaultPageSize]
  );

  const setFilter = useCallback(
    (next: string) => {
      push((params) => {
        params.set(filterKey, next);
        params.delete("page"); // 換篩選必須回到第 1 頁
      });
    },
    [push, filterKey]
  );

  const setSearch = useCallback(
    (next: string) => {
      push((params) => {
        if (next) params.set("q", next);
        else params.delete("q");
        params.delete("page"); // 換搜尋必須回到第 1 頁
      });
    },
    [push]
  );

  const setPage = useCallback(
    (next: number) => {
      push((params) => params.set("page", String(Math.max(1, next))));
    },
    [push]
  );

  const setPageSize = useCallback(
    (next: number) => {
      push((params) => {
        params.set("limit", String(next));
        params.delete("page"); // 每頁筆數改變後，舊的頁碼指向的區段已經不同
      });
    },
    [push]
  );

  const toApiQuery = useCallback(
    (extra: Record<string, string | number | undefined> = {}) => {
      const params = new URLSearchParams();
      if (filter && filter !== "all") params.set(filterKey, filter);
      if (search) params.set("q", search);
      params.set("page", String(page));
      params.set("limit", String(pageSize));
      for (const [key, value] of Object.entries(extra)) {
        if (value !== undefined && value !== "") params.set(key, String(value));
      }
      return params.toString();
    },
    [filter, filterKey, search, page, pageSize]
  );

  return { filter, search, page, pageSize, setFilter, setSearch, setPage, setPageSize, toApiQuery };
}
