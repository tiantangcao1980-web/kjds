import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

/**
 * These are integration tests over a *packed* plugin package: `lib/config.js`
 * and `lib/catalog.js` only exist after `node scripts/pack.mjs <collection>`.
 * In the source tree they are absent, so the file skips instead of failing.
 */
const hasGenerated = ['../lib/config.js', '../lib/catalog.js'].every((rel) =>
  existsSync(fileURLToPath(new URL(rel, import.meta.url))),
);

if (!hasGenerated) {
  test('plugin integration tests', { skip: 'generated package files are absent; run `node --test` inside a packed package' }, () => {});
} else {
  const { apply, inject } = await import('../index.js');
  const { CONFIG } = await import('../lib/config.js');
  const { CATALOG } = await import('../lib/catalog.js');

  function buildContext() {
    const registered = { providers: [], tools: [] };
    const ctx = {
      skills: {
        registerProvider(factory) {
          registered.providers.push(factory({ signal: new AbortController().signal, invalidate() {} }));
        },
      },
      tools: {
        register(definition) {
          registered.tools.push(definition);
          return () => {};
        },
      },
    };
    apply(ctx);
    return registered;
  }

  test('registers exactly one skill provider and one tool', () => {
    const registered = buildContext();
    assert.equal(registered.providers.length, 1);
    assert.equal(registered.tools.length, 1);
    assert.equal(registered.tools[0].name, CONFIG.toolName);
    assert.deepEqual(inject, ['skills', 'tools']);
  });

  test('the provider advertises exactly one model-invocable entry skill', async () => {
    const { providers } = buildContext();
    const [provider] = providers;
    assert.equal(provider.name, CONFIG.providerName);
    const candidates = await provider.list();
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].name, CONFIG.skillName);
    assert.equal(candidates[0].invocation.modelInvocable, true);
    const loaded = await provider.get(candidates[0]);
    assert.match(loaded.content, new RegExp(CONFIG.toolName));
  });

  test('the entry skill description names the covered platforms', async () => {
    const { providers } = buildContext();
    const [candidate] = await providers[0].list();
    assert.ok(CONFIG.scope.length > 0, 'CONFIG.scope must be generated');
    assert.match(candidate.description, new RegExp(CONFIG.scope.slice(0, 6)));
  });

  test('the catalog matches the packaged skill count', () => {
    assert.equal(CATALOG.length, CONFIG.skillCount);
    assert.ok(CONFIG.skillCount > 0);
  });

  test('the tool schema is object-rooted and requires action', () => {
    const { tools } = buildContext();
    const [tool] = tools;
    assert.equal(tool.parameters.type, 'object');
    assert.deepEqual(tool.parameters.required, ['action']);
    assert.equal(typeof tool.output.render, 'function');
  });

  test('search finds a catalog entry by its own name', async () => {
    const { tools } = buildContext();
    const sample = CATALOG[0];
    const value = await tools[0].execute({ action: 'search', query: sample.name }, {});
    assert.equal(value.ok, true);
    assert.ok(value.result.matches.some((match) => match.name === sample.name));
  });

  test('unknown action is refused', async () => {
    const { tools } = buildContext();
    const value = await tools[0].execute({ action: 'nope' }, {});
    assert.equal(value.ok, false);
    assert.match(value.error, /search/);
  });

  test('read returns the body without frontmatter and lists sibling files', async () => {
    const { tools } = buildContext();
    const sample = CATALOG[0];
    const value = await tools[0].execute({ action: 'read', name: sample.name }, {});
    assert.equal(value.ok, true);
    assert.ok(value.result.content.length > 100);
    assert.ok(!value.result.content.startsWith('---'));
    assert.ok(Array.isArray(value.result.files));
  });

  test('read refuses an unknown skill', async () => {
    const { tools } = buildContext();
    const value = await tools[0].execute({ action: 'read', name: 'no-such-skill-zzz' }, {});
    assert.equal(value.ok, false);
  });

  test('file refuses path traversal', async () => {
    const { tools } = buildContext();
    const value = await tools[0].execute({ action: 'file', name: CATALOG[0].name, file: '../../index.js' }, {});
    assert.equal(value.ok, false);
  });

  test('file reads a real reference from a skill that has one', async () => {
    const { tools } = buildContext();
    const withReferences = CATALOG.find((entry) => entry.hasReferences);
    assert.ok(withReferences, 'expected at least one skill with references');
    const read = await tools[0].execute({ action: 'read', name: withReferences.name }, {});
    const reference = read.result.files.find((file) => file.startsWith('references/'));
    assert.ok(reference, 'expected a references/ file');
    const path = reference.split(' (')[0];
    const value = await tools[0].execute({ action: 'file', name: withReferences.name, file: path }, {});
    assert.equal(value.ok, true);
    assert.ok(value.result.content.length > 0);
  });

  test('the OZON API reference files are each readable in one call', async () => {
    const { tools } = buildContext();
    const entry = CATALOG.find((item) => item.name === 'sealeap-ozon-seller-api');
    if (!entry) {
      // The amazon package does not ship this skill.
      return;
    }
    const [tool] = tools;
    const listed = await tool.execute({ action: 'read', name: entry.name }, {});
    assert.equal(listed.ok, true);
    const files = listed.result.files.map((file) => file.split(' (')[0]);
    const endpointFiles = files.filter((file) => /^references\/endpoints-[a-z]+\.md$/.test(file));
    assert.ok(endpointFiles.length >= 9, `expected the domain files, got ${endpointFiles.join(', ')}`);
    for (const file of endpointFiles) {
      const value = await tool.execute({ action: 'file', name: entry.name, file }, {});
      assert.equal(value.ok, true, `${file} should be readable`);
      assert.notEqual(value.result.truncated, true, `${file} should fit in one read`);
      assert.match(value.result.content, /`(POST|GET) \//);
    }
    const index = await tool.execute({ action: 'file', name: entry.name, file: 'references/index.md' }, {});
    assert.equal(index.ok, true);
    assert.match(index.result.content, /endpoints-products\.md/);
  });

  test('list reports the packaged categories and total', async () => {
    const { tools } = buildContext();
    const value = await tools[0].execute({ action: 'list' }, {});
    assert.equal(value.ok, true);
    assert.equal(value.result.total, CONFIG.skillCount);
    assert.ok(value.result.categories.length > 0);
  });

  test('list drills down into one category', async () => {
    const { tools } = buildContext();
    const category = CATALOG[0].categoryPath[0];
    const value = await tools[0].execute({ action: 'list', category }, {});
    assert.equal(value.ok, true);
    assert.equal(value.result.category, category);
    const expected = CATALOG.filter((entry) => entry.categoryPath.includes(category)).length;
    assert.equal(value.result.total, expected);
    assert.ok(value.result.skills.length > 0);
    assert.ok(value.result.skills.every((skill) => skill.category.includes(category)));
    const blocks = tools[0].output.render({ action: 'list' }, value);
    assert.match(blocks[0].text, new RegExp(category));
  });

  test('list refuses a category that does not exist', async () => {
    const { tools } = buildContext();
    const value = await tools[0].execute({ action: 'list', category: 'no-such-category-zzz' }, {});
    assert.equal(value.ok, false);
  });

  test('file truncates an oversized file instead of failing', async () => {
    const { tools } = buildContext();
    const [tool] = tools;
    let hit = null;
    for (const entry of CATALOG.filter((candidate) => candidate.hasReferences).slice(0, 200)) {
      const listed = await tool.execute({ action: 'read', name: entry.name }, {});
      const big = listed.result.files.find((file) => Number((file.match(/\((\d+) B\)$/) ?? [])[1] ?? 0) > 40000);
      if (big) {
        hit = { name: entry.name, file: big.split(' (')[0] };
        break;
      }
    }
    if (!hit) {
      // Truncation logic is unit-tested in read.test.js; this only proves the packaged data reaches it.
      return;
    }
    const value = await tool.execute({ action: 'file', name: hit.name, file: hit.file }, {});
    assert.equal(value.ok, true);
    assert.equal(value.result.truncated, true);
    assert.ok(value.result.content.length <= 40100);
    const blocks = tool.output.render({ action: 'file' }, value);
    assert.match(blocks[0].text, /截断/);
  });

  test('render turns a search result into text blocks', async () => {
    const { tools } = buildContext();
    const [tool] = tools;
    const value = await tool.execute({ action: 'search', query: CATALOG[0].name }, {});
    const blocks = tool.output.render({ action: 'search' }, value);
    assert.equal(blocks[0].type, 'text');
    assert.ok(blocks[0].text.length > 0);
  });
}
