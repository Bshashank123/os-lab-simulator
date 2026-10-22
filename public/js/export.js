// CSV (spreadsheet-friendly) and JSON export of an experiment. Everything stays in the browser.
import { download } from './ui.js';

const cell = (v) => { const s = v === null || v === undefined ? '' : Array.isArray(v) ? v.join('; ') : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const line = (arr) => arr.map(cell).join(',');
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'experiment';

export function toCSV(exp, tableData) {
  const rows = [['Experiment', exp.name], ['Week', exp.week], ['Topic', exp.topic], ['Algorithm', exp.algorithm], ['Saved', exp.date], ['Input (JSON)', JSON.stringify(exp.input)], [], ['Metric', 'Value']];
  Object.entries(exp.metrics || {}).forEach(([k, v]) => rows.push([k, v]));
  if (tableData) { rows.push([], tableData.columns, ...tableData.rows); }
  return '\ufeff' + rows.map(line).join('\r\n');   // BOM so Excel reads UTF-8
}
export const toJSON = (exp) => JSON.stringify(exp, null, 2);
export const exportCSV = (exp, tableData) => download(`${slug(exp.name)}.csv`, toCSV(exp, tableData), 'text/csv;charset=utf-8');
export const exportJSON = (exp) => download(`${slug(exp.name)}.json`, toJSON(exp), 'application/json');
export const exportAllJSON = (list) => download('os-lab-experiments.json', JSON.stringify(list, null, 2), 'application/json');
