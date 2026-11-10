/**
 * 报表渲染：日报/周报 Markdown + 单文件看板 HTML（内联 CSS/SVG，无外部资源）。
 * 指标以「卡片 + 表格」形式传入，平台无关。
 */
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const escapeHtml = (value) => String(value ?? '').replace(/[&<>]/g, (char) => ESCAPES[char]);

export function renderMarkdownReport({ title, date, cards = [], tables = [], todos = [], footer = null }) {
  const lines = [`# ${title} · ${date}`, ''];
  if (cards.length > 0) {
    lines.push('| 指标 | 数值 |', '|---|---|');
    for (const card of cards) lines.push(`| ${card.label} | ${card.value} |`);
    lines.push('');
  }
  for (const table of tables) {
    lines.push(`## ${table.title}`, '');
    lines.push(`| ${table.columns.join(' | ')} |`);
    lines.push(`|${table.columns.map(() => '---').join('|')}|`);
    for (const row of table.rows) lines.push(`| ${row.join(' | ')} |`);
    lines.push('');
  }
  if (todos.length > 0) {
    lines.push('## 待办', '');
    for (const todo of todos) lines.push(`- ${todo}`);
    lines.push('');
  }
  if (footer) lines.push(footer, '');
  return lines.join('\n');
}

export function svgBars(series, { width = 640, height = 220, label = 'value' } = {}) {
  const max = Math.max(1, ...series.map((point) => Number(point[label]) || 0));
  const barWidth = series.length ? Math.max(4, Math.floor((width - 40) / series.length) - 8) : 40;
  const bars = series
    .map((point, index) => {
      const value = Number(point[label]) || 0;
      const barHeight = Math.round((value / max) * (height - 60));
      const x = 30 + index * (barWidth + 8);
      const y = height - 30 - barHeight;
      return `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="#1f6feb" rx="4"></rect><text x="${x + barWidth / 2}" y="${height - 10}" font-size="11" text-anchor="middle" fill="#666">${escapeHtml(point.date ?? '')}</text>`;
    })
    .join('\n');
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${bars}</svg>`;
}

export function renderDashboardHtml({ title, date, cards = [], alerts = [], series = [], seriesLabel = 'value' }) {
  const alertRows = alerts
    .map((alert) => `<tr class="sev-${escapeHtml(alert.severity ?? 'P1')}"><td>${escapeHtml(alert.severity ?? 'P1')}</td><td>${escapeHtml(alert.message)}</td></tr>`)
    .join('\n');
  const cardHtml = cards
    .map((card) => `<div class="card"><div class="value">${escapeHtml(card.value)}</div><div class="label">${escapeHtml(card.label)}</div></div>`)
    .join('\n');
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(title)} · ${escapeHtml(date)}</title>
<style>
body{font-family:-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;margin:24px;color:#1d2129;background:#f7f8fa}
h1{font-size:20px}.cards{display:flex;gap:12px;flex-wrap:wrap}
.card{background:#fff;border-radius:8px;padding:14px 18px;box-shadow:0 1px 2px rgba(0,0,0,.06);min-width:130px}
.card .value{font-size:24px;font-weight:600}.card .label{color:#86909c;font-size:12px}
table{border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;margin-top:12px}
td,th{padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;text-align:left}
.sev-P0 td{color:#d4380d;font-weight:600}.sev-P1 td{color:#d48806}
</style></head><body>
<h1>${escapeHtml(title)} · ${escapeHtml(date)}</h1>
<div class="cards">${cardHtml}</div>
${series.length ? `<h2 style="font-size:15px;margin-top:22px">走势</h2>${svgBars(series, { label: seriesLabel })}` : ''}
<h2 style="font-size:15px;margin-top:22px">预警</h2>
<table><thead><tr><th>级别</th><th>内容</th></tr></thead><tbody>${alertRows || '<tr><td colspan="2">无预警</td></tr>'}</tbody></table>
</body></html>
`;
}
