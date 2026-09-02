#!/usr/bin/env ts-node
/**
 * check_events.ts
 * -------------------
 * Lightweight parser & validator that reconciles Rust `#[contractevent]`
 * struct definitions against a JSON documentation manifest.
 *
 * Usage:
 *   ts-node scripts/check_events.ts \
 *       --rust   contract/contracts/hello-world/src/base/events.rs \
 *       --docs   contract/contract_events_docs.json
 *
 * Exit codes:
 *   0  - documentation and implementation are in sync
 *   1  - drift detected (undocumented event, missing/extra field, etc.)
 *   2  - CLI / IO error
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParsedField {
  name: string;
  type: string;
  isTopic: boolean;
}

interface ParsedEvent {
  structName: string;
  eventSymbol: string;
  dataFormat: 'struct' | 'single-value';
  fields: ParsedField[];
}

interface DocField {
  name: string;
  type: string;
  isTopic: boolean;
  required?: boolean;
}

interface DocEvent {
  structName: string;
  eventSymbol: string;
  dataFormat?: 'struct' | 'single-value';
  category?: string;
  fields: DocField[];
}

interface DocsManifest {
  sourceRustFile?: string;
  description?: string;
  events: DocEvent[];
}

type Severity = 'error' | 'warning' | 'info';
interface Finding {
  severity: Severity;
  message: string;
  event?: string;
}

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): { rustPath: string; docsPath: string } {
  let rustPath: string | undefined;
  let docsPath: string | undefined;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--rust' && argv[i + 1]) {
      rustPath = argv[++i];
    } else if (a === '--docs' && argv[i + 1]) {
      docsPath = argv[++i];
    } else if (a === '--help' || a === '-h') {
      printUsage();
      process.exit(0);
    }
  }
  if (!rustPath || !docsPath) {
    printUsage();
    process.exit(2);
  }
  return { rustPath, docsPath };
}

function printUsage(): void {
  const script = path.basename(process.argv[1] ?? 'check_events.ts');
  process.stderr.write(
    `Usage: ts-node ${script} --rust <events.rs> --docs <contract_events_docs.json>\n`
  );
}

// ---------------------------------------------------------------------------
// Rust source parser (regex-based, sufficient for the Soroban #[contractevent]
// shape used by this repository).
// ---------------------------------------------------------------------------

const CONTRACT_EVENT_ATTR_RE =
  /#\[contractevent(\s*\(\s*data_format\s*=\s*"(?<df>single-value|struct)"\s*\))?\]/;
const STRUCT_RE = /^\s*pub\s+struct\s+(?<name>[A-Za-z0-9_]+)\s*\{/;
const FIELD_ATTR_TOPIC_RE = /#\[topic\]/;
const FIELD_RE = /^\s*pub\s+(?<name>[A-Za-z0-9_]+)\s*:\s*(?<type>[^,]+?),?\s*$/;

/**
 * Converts a PascalCase struct identifier into the snake_case event symbol
 * that `soroban-sdk`'s `#[contractevent]` macro derives as the first topic.
 *   ContractPaused   -> contract_paused
 *   AutoshareCreated -> autoshare_created
 */
function structNameToEventSymbol(structName: string): string {
  return structName
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

function trimTrailingComma(s: string): string {
  const t = s.trim();
  return t.endsWith(',') ? t.slice(0, -1).trim() : t;
}

function parseRustEvents(rustSource: string): ParsedEvent[] {
  const lines = rustSource.split(/\r?\n/);
  const events: ParsedEvent[] = [];

  let i = 0;
  while (i < lines.length) {
    const attrMatch = lines[i].match(CONTRACT_EVENT_ATTR_RE);
    if (!attrMatch) {
      i++;
      continue;
    }

    // Skip any intermediate doc comments / attributes between #[contractevent]
    // and the struct declaration (e.g. #[derive(...)] lines).
    let structLineIdx = -1;
    for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
      if (STRUCT_RE.test(lines[j])) {
        structLineIdx = j;
        break;
      }
    }
    if (structLineIdx === -1) {
      i++;
      continue;
    }

    const structName = lines[structLineIdx].match(STRUCT_RE)!.groups!.name;
    const dataFormat = (attrMatch.groups?.df as 'single-value' | 'struct') ?? 'struct';

    // Collect fields until the matching closing brace of the struct body.
    const fields: ParsedField[] = [];
    let pendingTopic = false;
    let braceDepth = 0;
    for (let k = structLineIdx; k < lines.length; k++) {
      const line = lines[k];
      const open = (line.match(/\{/g) ?? []).length;
      const close = (line.match(/\}/g) ?? []).length;
      braceDepth += open - close;

      if (k === structLineIdx) {
        if (braceDepth === 0) break;
        continue;
      }

      if (FIELD_ATTR_TOPIC_RE.test(line)) {
        pendingTopic = true;
      }

      const fieldMatch = line.match(FIELD_RE);
      if (fieldMatch && fieldMatch.groups) {
        const { name, type } = fieldMatch.groups;
        fields.push({
          name,
          type: trimTrailingComma(type),
          isTopic: pendingTopic,
        });
        pendingTopic = false;
      }

      if (braceDepth === 0) break;
    }

    events.push({
      structName,
      eventSymbol: structNameToEventSymbol(structName),
      dataFormat,
      fields,
    });

    i = structLineIdx + 1;
  }

  return events;
}

// ---------------------------------------------------------------------------
// Diff engine
// ---------------------------------------------------------------------------

function compare(
  parsed: ParsedEvent[],
  docs: DocsManifest
): Finding[] {
  const findings: Finding[] = [];
  const docByName = new Map(docs.events.map((e) => [e.structName, e]));
  const parsedByName = new Map(parsed.map((e) => [e.structName, e]));

  // Undocumented events (Rust has something the docs don't list)
  for (const p of parsed) {
    if (!docByName.has(p.structName)) {
      findings.push({
        severity: 'error',
        event: p.structName,
        message: `Event struct '${p.structName}' is emitted by the contract but is MISSING from contract_events_docs.json. Add it to the docs to fix this drift.`,
      });
    }
  }

  // Documented-but-not-implemented events (docs have something Rust doesn't emit)
  for (const d of docs.events) {
    if (!parsedByName.has(d.structName)) {
      findings.push({
        severity: 'error',
        event: d.structName,
        message: `Event '${d.structName}' is listed in contract_events_docs.json but no matching #[contractevent] struct exists in the Rust source. Remove the stale doc entry or implement the event.`,
      });
    }
  }

  // Field-level diff on events that exist in both.
  for (const p of parsed) {
    const d = docByName.get(p.structName);
    if (!d) continue;

    if (d.eventSymbol !== p.eventSymbol) {
      findings.push({
        severity: 'error',
        event: p.structName,
        message: `Event '${p.structName}' has documented eventSymbol='${d.eventSymbol}' but the Rust implementation derives '${p.eventSymbol}'. Update one of them to match.`,
      });
    }

    const documentedFormat = d.dataFormat ?? 'struct';
    if (documentedFormat !== p.dataFormat) {
      findings.push({
        severity: 'warning',
        event: p.structName,
        message: `Event '${p.structName}' data_format mismatch: docs='${documentedFormat}' vs Rust='${p.dataFormat}'. This changes the wire layout.`,
      });
    }

    const docFieldMap = new Map(d.fields.map((f) => [f.name, f]));
    const parsedFieldMap = new Map(p.fields.map((f) => [f.name, f]));

    for (const pf of p.fields) {
      const df = docFieldMap.get(pf.name);
      if (!df) {
        findings.push({
          severity: 'error',
          event: p.structName,
          message: `Field '${pf.name}' (type '${pf.type}', topic=${pf.isTopic}) exists in Rust event '${p.structName}' but is NOT documented. Add it to the docs manifest.`,
        });
        continue;
      }
      if (df.type !== pf.type) {
        findings.push({
          severity: 'error',
          event: p.structName,
          message: `Field '${pf.name}' in event '${p.structName}' type mismatch: docs='${df.type}' vs Rust='${pf.type}'.`,
        });
      }
      if (!!df.isTopic !== pf.isTopic) {
        findings.push({
          severity: 'error',
          event: p.structName,
          message: `Field '${pf.name}' in event '${p.structName}' isTopic mismatch: docs=${df.isTopic} vs Rust=${pf.isTopic}. Topic ordering changes subscription semantics for off-chain listeners.`,
        });
      }
    }

    for (const df of d.fields) {
      if (!parsedFieldMap.has(df.name)) {
        findings.push({
          severity: df.required === false ? 'info' : 'error',
          event: p.structName,
          message: `Documented field '${df.name}' (type '${df.type}') is MISSING from Rust event '${p.structName}'. Add the field to the struct or remove it from the docs.`,
        });
      }
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Report & exit
// ---------------------------------------------------------------------------

function report(findings: Finding[]): void {
  if (findings.length === 0) {
    process.stdout.write('✅ contract event documentation is in sync with implementation.\n');
    return;
  }
  process.stdout.write(
    `⚠️  ${findings.length} contract event documentation finding(s):\n\n`
  );
  const bySeverity: Record<Severity, Finding[]> = { error: [], warning: [], info: [] };
  for (const f of findings) bySeverity[f.severity].push(f);

  for (const sev of ['error', 'warning', 'info'] as Severity[]) {
    const list = bySeverity[sev];
    if (list.length === 0) continue;
    const tag = sev === 'error' ? '❌ ERROR' : sev === 'warning' ? '⚠️  WARN ' : 'ℹ️  INFO ';
    for (const f of list) {
      const ctx = f.event ? `[${f.event}] ` : '';
      process.stdout.write(`  ${tag}  ${ctx}${f.message}\n`);
    }
    process.stdout.write('\n');
  }
}

function main(): void {
  const { rustPath, docsPath } = parseArgs(process.argv);

  let rustSource: string;
  let docsJson: string;
  try {
    rustSource = fs.readFileSync(rustPath, 'utf8');
  } catch (e) {
    process.stderr.write(`Failed to read Rust source '${rustPath}': ${(e as Error).message}\n`);
    process.exit(2);
  }
  try {
    docsJson = fs.readFileSync(docsPath, 'utf8');
  } catch (e) {
    process.stderr.write(`Failed to read docs manifest '${docsPath}': ${(e as Error).message}\n`);
    process.exit(2);
  }

  let docs: DocsManifest;
  try {
    docs = JSON.parse(docsJson);
  } catch (e) {
    process.stderr.write(`Failed to parse docs JSON '${docsPath}': ${(e as Error).message}\n`);
    process.exit(2);
  }

  if (!docs.events || !Array.isArray(docs.events)) {
    process.stderr.write('Docs manifest must contain an "events" array.\n');
    process.exit(2);
  }

  const parsed = parseRustEvents(rustSource);
  const findings = compare(parsed, docs);
  report(findings);

  const errors = findings.filter((f) => f.severity === 'error').length;
  process.exit(errors > 0 ? 1 : 0);
}

main();
