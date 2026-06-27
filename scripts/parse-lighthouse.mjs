#!/usr/bin/env node
// Usage: node scripts/parse-lighthouse.mjs <report.json> [--category perf|a11y|seo|bp]

import { readFileSync } from 'fs';
import { argv } from 'process';

const CATEGORY_IDS = {
  perf: 'performance',
  performance: 'performance',
  a11y: 'accessibility',
  accessibility: 'accessibility',
  seo: 'seo',
  'best-practices': 'best-practices',
  bp: 'best-practices',
};

function score$(score) {
  if (score === null || score === undefined) return '⚪';
  if (score >= 0.9) return '🟢';
  if (score >= 0.5) return '🟡';
  return '🔴';
}

function pct(score) {
  if (score === null || score === undefined) return '—';
  return String(Math.round(score * 100));
}

function formatMs(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
}

function formatBytes(b) {
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024).toFixed(1)} KB`;
}

function stripMd(str = '') {
  return str.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/`/g, '').trim();
}

function renderItems(details) {
  if (!details?.items?.length) return [];
  const lines = [];
  const items = details.items.slice(0, 8);

  for (const item of items) {
    const url = item.url || item.source?.url || '';
    const node = item.node?.snippet || item.node?.nodeLabel || '';
    const label = item.label || item.description || item.text || '';
    const wastedMs = item.wastedMs ? `  → save ${formatMs(item.wastedMs)}` : '';
    const wastedBytes = item.wastedBytes ? `  → save ${formatBytes(item.wastedBytes)}` : '';
    const primary = url || node || label || JSON.stringify(item).slice(0, 100);
    if (primary) lines.push(`    • ${primary}${wastedMs}${wastedBytes}`);
  }
  if (details.items.length > 8) lines.push(`    … and ${details.items.length - 8} more`);
  return lines;
}

function isActionable(audit) {
  // Include: failed/warn scored audits AND informative audits that have a displayValue (actual measurements)
  const mode = audit.scoreDisplayMode;
  if (mode === 'notApplicable' || mode === 'manual' || mode === 'error') return false;
  if (mode === 'informative') return !!audit.displayValue; // show if it has a real measurement
  if (audit.score === null) return false;
  return audit.score < 1; // scored: show anything not perfect
}

function parseReport(filePath, filterCategory) {
  let raw;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    console.error(`Cannot read: ${filePath}`);
    process.exit(1);
  }

  const report = JSON.parse(raw);
  const { categories, audits, finalUrl, requestedUrl, fetchTime, configSettings } = report;

  const url = finalUrl || requestedUrl || 'unknown';
  const date = fetchTime ? new Date(fetchTime).toLocaleString() : 'unknown';
  const device = configSettings?.formFactor || 'unknown';

  console.log(`\n📊 Lighthouse Report`);
  console.log(`URL:    ${url}`);
  console.log(`Date:   ${date}`);
  console.log(`Device: ${device}\n`);

  console.log('── Category Scores ──────────────────────────────');
  for (const cat of Object.values(categories)) {
    console.log(`${score$(cat.score)} ${cat.title.padEnd(22)} ${pct(cat.score)}/100`);
  }
  console.log('');

  const targetId = filterCategory ? CATEGORY_IDS[filterCategory] : null;
  if (targetId && !categories[targetId]) {
    console.error(`Unknown category: ${filterCategory}. Options: perf, a11y, seo, bp`);
    process.exit(1);
  }

  const catsToShow = targetId
    ? [[targetId, categories[targetId]]]
    : Object.entries(categories);

  for (const [catId, category] of catsToShow) {
    const refs = category.auditRefs || [];
    // Build weight map from refs
    const weightMap = Object.fromEntries(refs.map((r) => [r.id, r.weight ?? 0]));

    const items = refs
      .map((ref) => ({ audit: audits[ref.id], weight: ref.weight ?? 0 }))
      .filter(({ audit }) => audit && isActionable(audit))
      .sort((a, b) => {
        // Sort: failing first, then by weight (higher weight = more impact), then by score asc
        const aFail = (a.audit.score ?? 1) < 1 ? 0 : 1;
        const bFail = (b.audit.score ?? 1) < 1 ? 0 : 1;
        if (aFail !== bFail) return aFail - bFail;
        if (b.weight !== a.weight) return b.weight - a.weight;
        return (a.audit.score ?? 0) - (b.audit.score ?? 0);
      });

    console.log(`${'═'.repeat(52)}`);
    console.log(`  ${category.title.toUpperCase()}  (score: ${pct(category.score)}/100)`);
    console.log(`${'═'.repeat(52)}`);

    if (!items.length) {
      console.log('  ✅ No actionable issues found.\n');
      continue;
    }

    for (const { audit, weight } of items) {
      const mode = audit.scoreDisplayMode;
      const isScored = mode !== 'informative';
      const tag = isScored ? `[${pct(audit.score)}] ` : '[metric] ';
      const emoji = isScored ? score$(audit.score) : '📏';
      const impactNote = weight > 0 ? ` (weight: ${weight})` : '';

      console.log(`\n${emoji} ${tag}${audit.title}${impactNote}`);
      if (audit.displayValue) console.log(`  Measured: ${audit.displayValue}`);

      if (audit.description) {
        const desc = stripMd(audit.description);
        // First sentence = what it is, rest may include fix hints
        const sentences = desc.split(/(?<=\.)\s+/);
        console.log(`  Issue:  ${sentences[0]}`);
        if (sentences[1]) console.log(`  Fix:    ${sentences.slice(1, 3).join(' ')}`);
      }

      const d = audit.details;
      if (d) {
        if (d.overallSavingsMs) console.log(`  Savings: ~${formatMs(d.overallSavingsMs)}`);
        if (d.overallSavingsBytes) console.log(`  Savings: ~${formatBytes(d.overallSavingsBytes)}`);
        const itemLines = renderItems(d);
        if (itemLines.length) {
          console.log('  Affected:');
          itemLines.forEach((l) => console.log(l));
        }
      }
    }

    console.log('');
  }

  // Final tally
  const allAudits = Object.values(audits);
  const failed = allAudits.filter((a) => a.score !== null && a.score < 0.5 && a.scoreDisplayMode === 'binary').length;
  const warn = allAudits.filter((a) => a.score !== null && a.score >= 0.5 && a.score < 1 && a.scoreDisplayMode === 'binary').length;
  console.log('── Totals ───────────────────────────────────────');
  console.log(`🔴 Failed audits:  ${failed}`);
  console.log(`🟡 Warning audits: ${warn}`);
  console.log('');
  console.log('Paste this output into Claude with: "Here is my Lighthouse report — what should I fix?"');
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const args = argv.slice(2).filter((a) => a !== '--');
const flags = new Map();
const positional = [];

for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    flags.set(args[i].slice(2), args[i + 1] ?? true);
    i++;
  } else {
    positional.push(args[i]);
  }
}

const filePath = positional[0];
if (!filePath) {
  console.error('Usage: node scripts/parse-lighthouse.mjs <report.json> [--category perf|a11y|seo|bp]');
  process.exit(1);
}

parseReport(filePath, flags.get('category'));
