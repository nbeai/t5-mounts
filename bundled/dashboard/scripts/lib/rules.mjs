// A small declarative condition language for dashboard flags. No code is evaluated: every operator is a
// fixed comparison over one column and a literal, another column, or the dashboard reference time.
import { normalizeDate, parseNumber } from './source.mjs';

export function wallClock(instant, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(instant).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

const COMPARE = new Set(['eq', 'ne', 'lt', 'le', 'gt', 'ge']);

export function compileCondition(condition, { columns, types, flags, asOf, timeZone }, path = 'where') {
  const fail = (message) => { throw new Error(`${path}: ${message}`); };
  if (!condition || typeof condition !== 'object' || Array.isArray(condition)) fail('a condition must be one object such as {"eq":["상태","신규"]}');
  const keys = Object.keys(condition);
  if (keys.length !== 1) fail(`use exactly one operator per object, got ${keys.join(', ') || 'none'}`);
  const [op] = keys; const arg = condition[op];
  const column = (name) => {
    const index = columns.indexOf(name);
    if (index < 0) fail(`unknown column "${name}". Columns: ${columns.join(', ')}`);
    return index;
  };
  if (op === 'all' || op === 'any') {
    if (!Array.isArray(arg) || !arg.length) fail(`${op} needs a non-empty array`);
    const parts = arg.map((item, i) => compileCondition(item, { columns, types, flags, asOf, timeZone }, `${path}.${op}[${i}]`));
    return op === 'all' ? (row) => parts.every((part) => part(row)) : (row) => parts.some((part) => part(row));
  }
  if (op === 'not') { const part = compileCondition(arg, { columns, types, flags, asOf, timeZone }, `${path}.not`); return (row) => !part(row); }
  if (op === 'flag') {
    if (!flags.has(arg)) fail(`unknown flag "${arg}". Define it earlier in flags. Known: ${[...flags.keys()].join(', ') || 'none'}`);
    const index = flags.get(arg); return (row) => row.flags[index] === true;
  }
  if (op === 'blank' || op === 'present') { const index = column(arg); return op === 'blank' ? (row) => row.values[index] == null : (row) => row.values[index] != null; }
  if (op === 'in' || op === 'notIn') {
    if (!Array.isArray(arg) || arg.length !== 2 || !Array.isArray(arg[1])) fail(`${op} is [column, [values]]`);
    const index = column(arg[0]); const set = new Set(arg[1].map(String));
    return op === 'in' ? (row) => row.values[index] != null && set.has(String(row.values[index]))
      : (row) => row.values[index] == null || !set.has(String(row.values[index]));
  }
  if (op === 'contains') {
    if (!Array.isArray(arg) || arg.length !== 2) fail('contains is [column, text]');
    const index = column(arg[0]); const needle = String(arg[1]);
    return (row) => row.values[index] != null && String(row.values[index]).includes(needle);
  }
  if (!COMPARE.has(op)) fail(`unknown operator "${op}". Use all, any, not, flag, blank, present, in, notIn, contains, eq, ne, lt, le, gt, ge`);
  if (!Array.isArray(arg) || arg.length !== 2) fail(`${op} is [column, value]`);
  const index = column(arg[0]); const type = types[index];
  // A date column compared with a text that is no date is almost always "$today"/"$now" replaced by a shell
  // (an unquoted heredoc turns it into ""). Say so instead of silently comparing with nothing (F1 2026-09-27).
  if ((type === 'date' || type === 'datetime') && typeof arg[1] === 'string' && !['$today', '$now'].includes(arg[1])
    && normalizeDate(arg[1]) == null) {
    fail(`"${arg[1]}" is not a date for the date column "${arg[0]}". "$today" and "$now" are literal spec tokens: `
      + 'write the spec with a quoted heredoc (<<\'JSON\') or a file tool so the shell does not replace them');
  }
  const operand = resolveOperand(arg[1], { columns, types, asOf, timeZone, fail, column });
  const compare = (left, right) => {
    if (left == null || right == null) return null;
    if (type === 'number') { const a = parseNumber(left); const b = typeof right === 'number' ? right : parseNumber(right); return a == null || b == null ? null : a - b; }
    if (type === 'date' || type === 'datetime') {
      let a = normalizeDate(left); let b = normalizeDate(right);
      if (a == null || b == null) return null;
      if (a.length === 10 || b.length === 10) { a = a.slice(0, 10); b = b.slice(0, 10); }
      return a < b ? -1 : a > b ? 1 : 0;
    }
    const a = String(left); const b = String(right); return a < b ? -1 : a > b ? 1 : 0;
  };
  const test = { eq: (d) => d === 0, ne: (d) => d !== 0, lt: (d) => d < 0, le: (d) => d <= 0, gt: (d) => d > 0, ge: (d) => d >= 0 }[op];
  return (row) => { const d = compare(row.values[index], operand(row)); return d != null && test(d); };
}

function resolveOperand(value, { asOf, timeZone, column }) {
  if (value === '$today') return () => wallClock(asOf, timeZone).slice(0, 10);
  if (value === '$now') return () => wallClock(asOf, timeZone);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (Number.isFinite(value.today)) { const text = wallClock(new Date(asOf.getTime() + value.today * 86_400_000), timeZone).slice(0, 10); return () => text; }
    if (Number.isFinite(value.nowHours)) { const text = wallClock(new Date(asOf.getTime() + value.nowHours * 3_600_000), timeZone); return () => text; }
    if (typeof value.column === 'string') { const index = column(value.column); return (row) => row.values[index]; }
    throw new Error('operand objects are {"today": days}, {"nowHours": hours} or {"column": name}');
  }
  return () => value;
}
