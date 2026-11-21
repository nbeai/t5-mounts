// Read a tabular business source through T5's existing readers and normalize cells into plain values.
// The reader owns parsing; this module only turns observed cells into rows the dashboard can compute on.
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

import { inspectBusinessDocument } from '../../../../src/areas/document/document-data-inspector.js';
import { decodeTextDocument, detectTextDocument, inspectDelimitedText } from '../../../../src/areas/document/text-document-observer.js';

const MAX_CELLS = 100_000;

// Excel date cells arrive as ISO strings whose UTC fields are the sheet's wall-clock time.
function cellValue(cell) {
  const raw = cell.formula ? cell.result : cell.value;
  if (raw == null || raw === '') return null;
  if (cell.type === 'date') {
    const wall = String(raw).slice(0, 19);
    return wall.endsWith('T00:00:00') ? wall.slice(0, 10) : wall.replace('T', ' ').slice(0, 16);
  }
  if (typeof raw === 'object') return raw.error ? `#${raw.error}` : String(raw.text ?? JSON.stringify(raw));
  return raw;
}

// A saved API answer (JSON): an array of records, or the array at `rows` (dot path, e.g. "data.items"). Keys become columns in first-seen order.
function jsonTable(file, data, rowsAt) {
  let list = data;
  if (rowsAt) for (const key of String(rowsAt).split('.')) list = list?.[key];
  else if (!Array.isArray(list) && list && typeof list === 'object') list = Object.values(list).find((value) => Array.isArray(value));
  if (!Array.isArray(list) || list.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
    throw new Error('the JSON source must be an array of records (set source.rows to the path of that array)');
  }
  if (list.length > 200_000) throw new Error('the source is larger than the dashboard reader bound');
  const columns = []; for (const item of list) for (const key of Object.keys(item)) if (!columns.includes(key)) columns.push(key);
  const cell = (value) => (value == null || value === '' ? null : typeof value === 'number' || typeof value === 'boolean' ? value
    : typeof value === 'object' ? JSON.stringify(value) : String(value).trim() || null);
  return { file, kind: 'json', sheet: null, headerRow: null, columns,
    rows: list.map((item, index) => ({ sourceRow: index + 1, values: columns.map((key) => cell(item[key])) })), textSource: true };
}

export async function loadSourceTable({ path, sheet = null, headerRow = null, rows: rowsAt = null } = {}) {
  const file = resolve(String(path ?? ''));
  const ext = extname(file).toLowerCase();
  if (ext === '.json') {
    let data; try { data = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/u, '')); } catch { throw new Error('the JSON source could not be read as JSON'); }
    return jsonTable(file, data, rowsAt);
  }
  if (['.csv', '.tsv', '.txt'].includes(ext)) {
    const bytes = await readFile(file);
    const detected = detectTextDocument(bytes, file);
    if (!detected) throw new Error('the text source could not be decoded; convert it to UTF-8 CSV or XLSX');
    const text = decodeTextDocument(bytes, detected.encoding).replace(/^﻿/u, '');
    const table = inspectDelimitedText(text, { delimiter: ext === '.tsv' ? '\t' : ',', maxRows: 200_000, maxColumns: 200 });
    if (table.projection.rowsTruncation || table.projection.columnsTruncation) throw new Error('the source is larger than the dashboard reader bound');
    const all = [table.header, ...table.rows];
    const headerIndex = Math.max(0, (headerRow ?? 1) - 1);
    const header = all[headerIndex].map((value) => String(value).trim());
    const rows = all.slice(headerIndex + 1).filter((row) => row.some((value) => String(value).trim() !== ''))
      .map((row, index) => ({ sourceRow: headerIndex + index + 2, values: header.map((_, column) => {
        const value = String(row[column] ?? '').trim(); return value === '' ? null : value; }) }));
    return { file, kind: 'csv', sheet: null, headerRow: headerIndex + 1, columns: header, rows, textSource: true };
  }
  const observation = await inspectBusinessDocument({ file, maxCells: MAX_CELLS, ...(sheet ? { sheet } : {}) });
  if (observation.kind !== 'xlsx') throw new Error(`unsupported dashboard source: ${observation.kind}; use XLSX or CSV`);
  if (observation.projection?.truncated) throw new Error('the workbook is larger than the dashboard reader bound');
  const selected = sheet ? observation.workbook.sheets.find((item) => item.name === sheet)
    : observation.workbook.sheets.find((item) => item.kind === 'worksheet' && item.state === 'visible' && item.cells.length);
  if (!selected) throw new Error('no visible worksheet with data');
  const grid = new Map();
  for (const cell of selected.cells) grid.set(`${cell.row}:${cell.column}`, cellValue(cell));
  const maxColumn = Math.max(...selected.cells.map((cell) => cell.column));
  const maxRow = Math.max(...selected.cells.map((cell) => cell.row));
  const rowValues = (row) => Array.from({ length: maxColumn }, (_, index) => grid.get(`${row}:${index + 1}`) ?? null);
  let header = headerRow;
  if (!header) for (let row = 1; row <= maxRow; row++) if (rowValues(row).filter((value) => value != null).length >= 2) { header = row; break; }
  const columns = rowValues(header).map((value, index) => (value == null ? `열${index + 1}` : String(value).trim()));
  const rows = [];
  for (let row = header + 1; row <= maxRow; row++) {
    if (selected.hiddenRows?.includes?.(row)) continue;
    const values = rowValues(row).map((value) => (typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value));
    if (values.some((value) => value != null)) rows.push({ sourceRow: row, values });
  }
  return { file, kind: 'xlsx', sheet: selected.name, sheets: observation.workbook.sheets.map((item) => item.name),
    headerRow: header, columns, rows, sha256: observation.file.sha256, textSource: false,
    hiddenRowsSkipped: selected.hiddenRows?.length ?? 0 };
}

// ---------- typing ----------
const DATE = /^\d{4}[-./]\d{1,2}[-./]\d{1,2}$/u;
const DATETIME = /^\d{4}[-./]\d{1,2}[-./]\d{1,2}[ T]\d{1,2}:\d{2}(?::\d{2})?$/u;
const NUMBER = /^[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/u;

export function normalizeDate(value) {
  const text = String(value).trim();
  const match = text.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/u);
  if (!match) return null;
  const [, y, m, d, hh, mm] = match;
  const date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  return hh == null ? date : `${date} ${hh.padStart(2, '0')}:${mm}`;
}

export function parseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value).trim().replace(/원$/u, '').trim();
  return NUMBER.test(text) ? Number(text.replaceAll(',', '')) : null;
}

export function inferType(values) {
  const present = values.filter((value) => value != null);
  if (!present.length) return 'empty';
  const share = (test) => present.filter(test).length / present.length;
  if (share((value) => typeof value === 'number' || parseNumber(value) != null) >= 0.9) return 'number';
  if (share((value) => typeof value === 'string' && DATETIME.test(value)) >= 0.9) return 'datetime';
  if (share((value) => typeof value === 'string' && (DATE.test(value) || DATETIME.test(value))) >= 0.9) return 'date';
  return 'text';
}

export const rowKey = (values) => JSON.stringify(values);
