import fs from "node:fs";
import path from "node:path";
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from "@playwright/test/reporter";

type FlowFailure = {
  title: string;
  project: string;
  error: string;
  screenshots: string[];
};

function walkTests(suite: Suite, out: TestCase[] = []): TestCase[] {
  for (const child of suite.suites) walkTests(child, out);
  out.push(...suite.tests);
  return out;
}

function getFlowName(title: string): string {
  const idx = title.indexOf("|");
  if (idx <= 0) return "UNGROUPED";
  return title.slice(0, idx).trim();
}

class FlowFailureReporter implements Reporter {
  private outputFile = "test-results/failure-flow-report.md";
  private rootSuite: Suite | null = null;

  onBegin(config: FullConfig, suite: Suite) {
    this.rootSuite = suite;
    const custom = config.metadata?.flowReportOutput;
    if (typeof custom === "string" && custom.trim()) this.outputFile = custom.trim();
  }

  onEnd(result: FullResult) {
    const failures = new Map<string, FlowFailure[]>();
    const allTests = walkTests(this.rootSuite ?? result.suite);

    for (const t of allTests) {
      for (const r of t.results) {
        if (r.status !== "failed" && r.status !== "timedOut") continue;
        const flow = getFlowName(t.title);
        const list = failures.get(flow) ?? [];
        list.push(this.toFailure(t, r));
        failures.set(flow, list);
      }
    }

    const lines: string[] = [];
    lines.push("# Playwright Failure Report (Grouped by Flow)");
    lines.push("");
    lines.push(`- Generated at: ${new Date().toISOString()}`);
    lines.push(`- Overall status: ${result.status}`);
    lines.push("");

    if (failures.size === 0) {
      lines.push("No failed tests. Great job.");
    } else {
      const orderedFlows = [...failures.keys()].sort();
      for (const flow of orderedFlows) {
        lines.push(`## ${flow}`);
        lines.push("");
        for (const item of failures.get(flow) ?? []) {
          lines.push(`- **${item.title}** (\`${item.project}\`)`);
          lines.push(`  - Error: ${item.error}`);
          if (item.screenshots.length > 0) {
            lines.push("  - Screenshots:");
            for (const sc of item.screenshots) lines.push(`    - ${sc}`);
          } else {
            lines.push("  - Screenshots: (none)");
          }
        }
        lines.push("");
      }
    }

    const fullPath = path.resolve(this.outputFile);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, lines.join("\n"), "utf8");
  }

  private toFailure(test: TestCase, result: TestResult): FlowFailure {
    const screenshots = result.attachments
      .filter((a) => a.contentType === "image/png" && !!a.path)
      .map((a) => path.normalize(a.path ?? ""));
    const err = result.error?.message?.split("\n")[0] ?? "Unknown failure";
    return {
      title: test.title,
      project: result.projectName,
      error: err,
      screenshots,
    };
  }
}

export default FlowFailureReporter;
