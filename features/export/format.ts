/**
 * Export: which records go out, and exactly how they are written.
 *
 * Pure, so the escaping rules are tested once. Saving the file is a separate
 * service (services/export); nothing here touches the device.
 */
import { parsedRecordDate, periodStart, recordDate } from '../transactions/records';
import type { Transaction } from '../transactions/model';
import { TYPE_LABELS } from '../../types/domain';

export type ExportFormat = 'CSV' | 'JSON';
export type ExportRange = '7d' | '30d' | 'all';

/** The design's two format cards. */
export const EXPORT_FORMATS: readonly { key: ExportFormat; sub: string }[] = [
  { key: 'CSV', sub: 'Spreadsheet-ready' },
  { key: 'JSON', sub: 'Full field detail' },
];

/** The design's range chips. */
export const EXPORT_RANGES: readonly { key: ExportRange; label: string }[] = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'all', label: 'All' },
];

/** The brief's CSV header, in its order. */
export const CSV_HEADER = [
  'Date',
  'Type',
  'Provider',
  'Amount',
  'Currency',
  'Sender',
  'Reference',
  'Confidence',
] as const;

/** Said in every JSON file, so the file explains itself away from the app. */
export const JSON_NOTES = [
  'Account and phone numbers are masked, as PesaIQ stores them.',
  'Source messages are not included.',
  'Demo sample records are not included.',
] as const;

export interface ExportSelection {
  /** Newest transaction first. */
  rows: Transaction[];
  /** Demo records in the range that were left out: they are invented. */
  demoLeftOut: number;
}

/**
 * The records an export would contain. Demo samples are left out: a CSV has
 * no column to mark them, so in a spreadsheet they would pass for real.
 */
export function selectForExport(
  transactions: readonly Transaction[],
  range: ExportRange,
  now: Date,
): ExportSelection {
  const from = periodStart(range === 'all' ? 'any' : range, now);
  const inRange = transactions.filter((t) => !from || recordDate(t) >= from);
  const rows = inRange
    .filter((t) => !t.isDemo)
    .sort(
      (a, b) =>
        recordDate(b).getTime() - recordDate(a).getTime() || b.createdAt.localeCompare(a.createdAt),
    );
  return { rows, demoLeftOut: inRange.length - rows.length };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD in local time: sorts correctly and every spreadsheet reads it. */
export const isoDay = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The transaction's date as exported, or null when the message carried none. */
export function exportDate(t: Transaction): string | null {
  const d = parsedRecordDate(t);
  return d ? isoDay(d) : null;
}

// Spreadsheet apps run a cell starting with one of these as a formula. These
// values come from SMS text that anyone can send, so they are defused.
const FORMULA_START = /^[=+\-@\t\r]/;

/** One text cell: formula-safe, and quoted when it holds a comma, quote or line break. */
export function csvText(value: string | null | undefined): string {
  if (value == null || value === '') return '';
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) || safe !== safe.trim() ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const csvNumber = (n: number | null): string => (n == null ? '' : String(n));

export function csvRow(t: Transaction): string {
  return [
    exportDate(t) ?? '',
    csvText(TYPE_LABELS[t.type]),
    csvText(t.provider),
    csvNumber(t.amount),
    csvText(t.currency),
    csvText(t.counterparty),
    csvText(t.transactionReference),
    t.confidence.toFixed(2),
  ].join(',');
}

/** RFC 4180: CRLF line endings, a header row, and a final line break. */
export function toCsv(rows: readonly Transaction[]): string {
  return [CSV_HEADER.join(','), ...rows.map(csvRow)].join('\r\n') + '\r\n';
}

/** One record with every field worth keeping. Never the source message. */
export function jsonRecord(t: Transaction) {
  return {
    id: t.id,
    date: exportDate(t),
    time: t.transactionTime,
    type: t.type,
    status: t.status,
    provider: t.provider,
    amount: t.amount,
    currency: t.currency,
    counterparty: t.counterparty,
    maskedAccountOrPhone: t.maskedAccountOrPhone,
    reference: t.transactionReference,
    balanceAfter: t.balanceAfter,
    confidence: Number(t.confidence.toFixed(2)),
    fieldsToCheck: t.lowFields,
    savedAt: t.createdAt,
  };
}

export function toJson(
  rows: readonly Transaction[],
  meta: { range: ExportRange; exportedAt: string },
): string {
  const document = {
    app: 'PesaIQ',
    exportedAt: meta.exportedAt,
    range: meta.range,
    count: rows.length,
    notes: JSON_NOTES,
    records: rows.map(jsonRecord),
  };
  return JSON.stringify(document, null, 2) + '\n';
}

/** What the saving service needs. */
export interface ExportFile {
  filename: string;
  mimeType: string;
  content: string;
}

export interface ExportPlan extends ExportFile {
  count: number;
  demoLeftOut: number;
  /** The first few rows, as the design previews them. */
  preview: string;
}

const PREVIEW_CSV_ROWS = 3;
const PREVIEW_JSON_ROWS = 2;
// Lets Excel read the file as UTF-8, so names with accents survive.
const UTF8_BOM = '﻿';

export function planExport(
  transactions: readonly Transaction[],
  format: ExportFormat,
  range: ExportRange,
  now: Date,
): ExportPlan {
  const { rows, demoLeftOut } = selectForExport(transactions, range, now);
  const stamp = isoDay(now);

  if (format === 'CSV') {
    return {
      filename: `pesaiq-export-${stamp}.csv`,
      mimeType: 'text/csv',
      content: UTF8_BOM + toCsv(rows),
      count: rows.length,
      demoLeftOut,
      preview: [CSV_HEADER.join(','), ...rows.slice(0, PREVIEW_CSV_ROWS).map(csvRow)].join('\n'),
    };
  }

  return {
    filename: `pesaiq-export-${stamp}.json`,
    mimeType: 'application/json',
    content: toJson(rows, { range, exportedAt: now.toISOString() }),
    count: rows.length,
    demoLeftOut,
    preview: JSON.stringify(rows.slice(0, PREVIEW_JSON_ROWS).map(jsonRecord), null, 1),
  };
}
