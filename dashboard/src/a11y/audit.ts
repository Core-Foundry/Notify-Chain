import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { axe } from 'jest-axe';

// Derive the axe result/violation shapes from jest-axe's own `axe` signature so
// we don't need to depend on axe-core's type entry point directly.
type AxeResults = Awaited<ReturnType<typeof axe>>;
export type Violation = AxeResults['violations'][number];
export type Impact = NonNullable<Violation['impact']>;

/**
 * Impact levels that should fail the build. Per the CI accessibility policy we
 * block on `critical` violations only; everything else is reported but treated
 * as non-blocking so teams can triage without breaking unrelated PRs.
 */
export const BLOCKING_IMPACTS: readonly Impact[] = ['critical'];

const IMPACT_ORDER: Impact[] = ['critical', 'serious', 'moderate', 'minor'];

export interface AuditEntry {
  name: string;
  violations: Violation[];
}

const auditLog: AuditEntry[] = [];

/**
 * Runs the axe accessibility engine against a rendered component/container,
 * records the result for the final report, and returns the violations found.
 *
 * This does not assert on its own — call {@link assertNoBlockingViolations} (or
 * inspect the returned violations) so the report still captures every component
 * even when an earlier one fails the build.
 */
export async function auditComponent(
  name: string,
  container: Element
): Promise<Violation[]> {
  const results = await axe(container);
  auditLog.push({ name, violations: results.violations });
  return results.violations;
}

/** Violations whose impact is in {@link BLOCKING_IMPACTS}. */
export function blockingViolations(violations: Violation[]): Violation[] {
  return violations.filter(
    (violation) =>
      violation.impact != null && BLOCKING_IMPACTS.includes(violation.impact)
  );
}

/**
 * Throws a readable error (failing the test, and therefore the CI build) when a
 * component has any blocking-impact accessibility violations.
 */
export function assertNoBlockingViolations(
  name: string,
  violations: Violation[]
): void {
  const blocking = blockingViolations(violations);
  if (blocking.length === 0) {
    return;
  }
  throw new Error(formatViolationsError(name, blocking));
}

function formatViolationsError(name: string, violations: Violation[]): string {
  const lines = violations.map((violation) => {
    const targets = violation.nodes
      .map((node) => node.target.join(' '))
      .join(', ');
    return `  • [${violation.impact}] ${violation.id}: ${violation.help}\n` +
      `    nodes: ${targets}\n` +
      `    help:  ${violation.helpUrl}`;
  });
  return (
    `${name} has ${violations.length} blocking accessibility ` +
    `violation(s):\n${lines.join('\n')}`
  );
}

function countByImpact(violations: Violation[]): Record<Impact, number> {
  const counts: Record<Impact, number> = {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
  };
  for (const violation of violations) {
    if (violation.impact != null) {
      counts[violation.impact] += 1;
    }
  }
  return counts;
}

/**
 * Writes a human-readable Markdown report of every audited component to
 * `reportPath` (relative to the dashboard working directory). Always produces a
 * file — even with zero violations — so CI can reliably upload it as an artifact.
 */
export function writeA11yReport(reportPath = 'a11y-report.md'): string {
  const absolutePath = resolve(process.cwd(), reportPath);
  mkdirSync(dirname(absolutePath), { recursive: true });

  const totals = countByImpact(auditLog.flatMap((entry) => entry.violations));
  const totalViolations = auditLog.reduce(
    (sum, entry) => sum + entry.violations.length,
    0
  );
  const blockingTotal = BLOCKING_IMPACTS.reduce(
    (sum, impact) => sum + totals[impact],
    0
  );

  const lines: string[] = [];
  lines.push('# Accessibility Report');
  lines.push('');
  lines.push(
    `Audited **${auditLog.length}** component(s) with [axe-core]` +
      '(https://github.com/dequelabs/axe-core).'
  );
  lines.push('');
  lines.push(
    `**${totalViolations}** total violation(s) — ` +
      `**${blockingTotal}** blocking (${BLOCKING_IMPACTS.join(', ')}).`
  );
  lines.push('');
  lines.push('| Impact | Count |');
  lines.push('| --- | --- |');
  for (const impact of IMPACT_ORDER) {
    lines.push(`| ${impact} | ${totals[impact]} |`);
  }
  lines.push('');

  lines.push('## Per-component results');
  lines.push('');
  for (const entry of auditLog) {
    if (entry.violations.length === 0) {
      lines.push(`### ✅ ${entry.name}`);
      lines.push('');
      lines.push('No violations detected.');
      lines.push('');
      continue;
    }

    lines.push(`### ❌ ${entry.name} (${entry.violations.length})`);
    lines.push('');
    for (const violation of entry.violations) {
      lines.push(`- **[${violation.impact}] ${violation.id}** — ${violation.help}`);
      lines.push(`  - Help: ${violation.helpUrl}`);
      for (const node of violation.nodes) {
        lines.push(`  - \`${node.target.join(' ')}\``);
      }
    }
    lines.push('');
  }

  const report = lines.join('\n');
  writeFileSync(absolutePath, report, 'utf8');
  return absolutePath;
}

/** Test-only: clears accumulated results (useful across isolated runs). */
export function resetA11yReport(): void {
  auditLog.length = 0;
}
