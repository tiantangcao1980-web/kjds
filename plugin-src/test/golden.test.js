import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

/**
 * Golden retrieval expectations: a curated set of real-operator questions and
 * the skills that must reach the top of the result list. Regressions in the
 * tokenizer, field weights, or synonyms surface here first. Expectations are
 * hand-curated; when the top hit changes, decide whether the new hit is better
 * before editing this list.
 */
const hasGenerated = ['../lib/config.js', '../lib/catalog.js'].every((rel) =>
  existsSync(fileURLToPath(new URL(rel, import.meta.url))),
);

if (!hasGenerated) {
  test('golden retrieval expectations', { skip: 'generated package files are absent; run `node --test` inside a packed package' }, () => {});
} else {
  const { CONFIG } = await import('../lib/config.js');
  const { CATALOG } = await import('../lib/catalog.js');
  const { searchEntries } = await import('../lib/search.js');
  const golden = JSON.parse(readFileSync(fileURLToPath(new URL(`./golden-${CONFIG.collection}.json`, import.meta.url)), 'utf8'));

  for (const item of golden) {
    test(`golden: ${item.query}`, () => {
      const topN = item.topN ?? 3;
      const results = searchEntries(CATALOG, item.query, { limit: topN });
      const names = results.map((entry) => entry.name);
      // No zero-hit queries: a real operator question always returns candidates.
      assert.ok(results.length > 0, `query 「${item.query}」 returned nothing`);
      const pattern = item.match ? new RegExp(item.match, 'i') : null;
      const hit =
        item.expected.some((name) => names.includes(name)) ||
        Boolean(
          pattern &&
            results.some((entry) => pattern.test(`${entry.name} ${entry.title} ${entry.shortDescription ?? ''}`)),
        );
      assert.ok(hit, `expected ${item.expected.join(' / ')} or /${item.match}/ in top ${topN}, got ${names.join(', ')}`);
    });
  }
}
