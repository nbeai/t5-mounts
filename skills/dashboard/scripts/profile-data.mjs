#!/usr/bin/env node
// One call that shows the model what a dashboard source actually contains: columns and inferred types,
// exact duplicate rows, repeated keys, blanks, low-cardinality values, date ranges and numeric sums.
// Facts only; the model decides what they mean for the user's purpose.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { inferType, loadSourceTable, normalizeDate, parseNumber, rowKey } from './lib/source.mjs';

const LOW_CARDINALITY = 12;

export async function profileSource({ path, sheet = null, headerRow = null, rows = null } = {}) {
  const table = await loadSourceTable({ path, sheet, headerRow, rows });
  const seen = new Map(); const exactDuplicates = [];
  for (const row of table.rows) {
    const key = rowKey(row.values);
    if (seen.has(key)) exactDuplicates.push({ sourceRow: row.sourceRow, sameAsRow: seen.get(key) });
    else seen.set(key, row.sourceRow);
  }
  const uniqueRows = table.rows.filter((row, index, all) => all.findIndex((other) => rowKey(other.values) === rowKey(row.values)) === index);
  const columns = table.columns.map((name, index) => {
    const values = table.rows.map((row) => row.values[index]);
    const type = inferType(values);
    const present = values.filter((value) => value != null);
    const distinct = new Map();
    for (const value of present) distinct.set(String(value), (distinct.get(String(value)) ?? 0) + 1);
    const column = { name, type, blanks: values.length - present.length, distinct: distinct.size };
    const uniqueValues = uniqueRows.map((row) => row.values[index]).filter((value) => value != null);
    if (distinct.size <= LOW_CARDINALITY && type !== 'number') column.values = Object.fromEntries([...distinct].sort((a, b) => b[1] - a[1]));
    else column.examples = [...distinct.keys()].slice(0, 3);
    if (type === 'number') {
      const numbers = present.map(parseNumber); const invalid = present.filter((value, i) => numbers[i] == null);
      const uniqueNumbers = uniqueValues.map(parseNumber).filter((value) => value != null);
      Object.assign(column, {
        sumAllRows: numbers.filter((value) => value != null).reduce((sum, value) => sum + value, 0),
        sumWithoutExactDuplicates: uniqueNumbers.reduce((sum, value) => sum + value, 0),
        zeros: numbers.filter((value) => value === 0).length,
        invalid: invalid.length, ...(invalid.length ? { invalidExamples: invalid.slice(0, 3) } : {}),
        min: Math.min(...numbers.filter((value) => value != null)), max: Math.max(...numbers.filter((value) => value != null)),
      });
    }
    if (type === 'date' || type === 'datetime') {
      const dates = present.map(normalizeDate).filter(Boolean).sort();
      Object.assign(column, { min: dates[0], max: dates.at(-1), unparsed: present.length - dates.length });
    }
    // Near-unique columns after exact duplicates are removed: a record key, or a key repeated by different rows.
    if (type !== 'number' && uniqueValues.length === uniqueRows.length) {
      const counts = new Map(); for (const value of uniqueValues) counts.set(String(value), (counts.get(String(value)) ?? 0) + 1);
      if (counts.size === uniqueRows.length) column.uniqueKey = true;
      else if (counts.size >= uniqueRows.length * 0.8) column.keyRepeatsWithDifferentValues = [...counts].filter(([, count]) => count > 1).slice(0, 10)
        .map(([value]) => ({ value, rows: table.rows.filter((row) => String(row.values[index]) === value).map((row) => row.sourceRow) }));
    }
    return column;
  });
  return {
    schema: 't5.dashboard-source-profile.v1',
    source: { path: table.file, kind: table.kind, sheet: table.sheet, sheets: table.sheets, headerRow: table.headerRow, sha256: table.sha256 ?? null },
    rows: table.rows.length, rowsWithoutExactDuplicates: uniqueRows.length,
    exactDuplicateRows: exactDuplicates,
    columns,
    notes: [
      'blanks are empty cells, not zero; zeros are counted separately',
      'sumWithoutExactDuplicates drops fully identical rows only',
    ],
  };
}

function argument(name) { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : argument('--source');
  if (!path) { process.stderr.write('Usage: profile-data.mjs SOURCE.xlsx|SOURCE.csv|SOURCE.json [--sheet NAME] [--header-row N] [--rows data.items]\n'); process.exit(2); }
  const headerRow = argument('--header-row');
  try {
    process.stdout.write(`${JSON.stringify(await profileSource({ path, sheet: argument('--sheet'), headerRow: headerRow ? Number(headerRow) : null, rows: argument('--rows') }))}\n`);
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exit(1); }
}
