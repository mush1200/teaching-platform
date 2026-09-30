import type AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";
import type { TestInfo } from "@playwright/test";

/**
 * **axe 的唯一政策來源**（`docs/ui-quality-system.md` §2.3／§2.4）。
 *
 * 兩個 gate 共用這一份：
 *   - `tests/e2e/axe-accessibility.spec.ts` —— mock 資料，每個 PR 的 L1 gate（`ui-quality` job）
 *   - `tests/visual/ui-review-a11y.spec.ts` —— UI Review 真實資料（`visual` job，`UI-QA-A11Y-SWEEP`）
 * 規則集、阻擋門檻、例外的比對方式都在這裡定義一次；兩支 spec 只各自決定「掃哪些頁」與「有哪些例外」。
 */

/** axe 規則集：WCAG 2.0／2.1／2.2 的 A 與 AA，加上 best-practice。 */
export const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

/** 阻擋 merge 的嚴重度；其餘（moderate／minor）只報告。 */
export const BLOCKING_IMPACTS = new Set(["critical", "serious"]);

/**
 * 逐條、精確的暫時例外 —— 每一條都是**已立案的既有缺陷**，不是「可以接受」。
 * **路由 ＋ rule ＋ 節點 selector ＋ scope** 必須全部相符；必須附 tracker ID。
 * 不得以 rule 或路由為單位整批略過。例外若已不再發生，`assertAxeClean` 會失敗（stale）。
 */
export type AxeException = {
  path: string;
  ruleId: string;
  /** axe 回報的節點 selector（`node.target.join(" ")`），必須完全相等。 */
  target: string;
  /** 例外成立的範圍（e2e 為 Playwright project 名、真實資料為寬度等）。 */
  scopes: string[];
  /** tracker ID。 */
  ref: string;
};

/** `AxeBuilder#analyze()` 的結果型別（不直接依賴 transitive 的 `axe-core` 套件）。 */
export type AxeResults = Awaited<ReturnType<AxeBuilder["analyze"]>>;

export type AxeFinding = { ruleId: string; impact: string; help: string; helpUrl: string; nodes: string[] };

/** 依政策評估一次掃描結果，附上 JSON 證據，並斷言：沒有 stale 例外、沒有 critical／serious。 */
export async function assertAxeClean(
  results: AxeResults,
  opts: {
    testInfo: TestInfo;
    label: string;
    path: string;
    role: string | null;
    scope: string;
    exceptions: AxeException[];
  }
) {
  const { testInfo, label, path, role, scope } = opts;
  const findings: AxeFinding[] = results.violations.map((v) => ({
    ruleId: v.id,
    impact: v.impact ?? "unknown",
    help: v.help,
    helpUrl: v.helpUrl,
    nodes: v.nodes.map((n) => n.target.join(" ")),
  }));

  const exceptionsHere = opts.exceptions.filter((e) => e.path === path && e.scopes.includes(scope));
  const used = new Set<AxeException>();
  const blocking: string[] = [];
  const advisory: string[] = [];

  for (const f of findings) {
    const remaining = f.nodes.filter((node) => {
      const hit = exceptionsHere.find((e) => e.ruleId === f.ruleId && e.target === node);
      if (hit) used.add(hit);
      return !hit;
    });
    if (remaining.length === 0) continue;
    const shown = remaining.slice(0, 3).join(" | ");
    const more = remaining.length > 3 ? ` (+${remaining.length - 3} more)` : "";
    const line = `[${f.impact}] ${f.ruleId} ×${remaining.length} — ${f.help} → ${shown}${more} (${f.helpUrl})`;
    (BLOCKING_IMPACTS.has(f.impact) ? blocking : advisory).push(line);
  }

  for (const line of advisory) {
    testInfo.annotations.push({ type: "axe-advisory", description: `${path} ${line}` });
  }
  await testInfo.attach(`axe-${role ?? "public"}-${scope}-${path.replace(/\W+/g, "_")}.json`, {
    body: JSON.stringify({ route: path, role, scope, findings }, null, 2),
    contentType: "application/json",
  });

  const stale = exceptionsHere.filter((e) => !used.has(e));
  expect(stale.map((e) => `${e.ruleId} @ ${e.target}（${e.ref}）`), "例外清單中已不再發生的條目 —— 請刪除").toEqual([]);
  expect(blocking, `${label} ${path} 的 critical／serious axe 違規`).toEqual([]);
}
