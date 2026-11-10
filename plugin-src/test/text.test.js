import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripFrontmatter, queryTerms, clampText } from '../lib/text.js';

test('stripFrontmatter removes a YAML block and returns the body', () => {
  const md = '---\nname: demo\ndescription: "x: y"\n---\n\n# Title\n\nBody.';
  assert.equal(stripFrontmatter(md), '# Title\n\nBody.');
});

test('stripFrontmatter handles CRLF frontmatter', () => {
  const md = '---\r\nname: demo\r\n---\r\n# Title\r\n';
  assert.equal(stripFrontmatter(md), '# Title');
});

test('stripFrontmatter leaves a body without frontmatter intact', () => {
  assert.equal(stripFrontmatter('# Title\n\nBody.'), '# Title\n\nBody.');
});

test('stripFrontmatter ignores a horizontal rule later in the body', () => {
  const md = '---\nname: demo\n---\n\nBody\n\n---\n\nMore';
  assert.equal(stripFrontmatter(md), 'Body\n\n---\n\nMore');
});

test('queryTerms lowercases and splits on whitespace', () => {
  assert.deepEqual(queryTerms('ACOS  诊断'), ['acos', '诊断']);
});

test('queryTerms drops empty input', () => {
  assert.deepEqual(queryTerms('   '), []);
});

test('queryTerms splits a Chinese sentence at stopwords', () => {
  const terms = queryTerms('新品怎么推');
  assert.ok(terms.includes('新品'), 'keeps the leading bigram');
  assert.ok(!terms.includes('怎么'), 'drops the stopword');
  assert.ok(!terms.includes('新品推'), 'does not glue across a removed stopword');
});

test('queryTerms drops Chinese stopwords from a longer question', () => {
  const terms = queryTerms('账号被封了怎么办');
  assert.ok(terms.includes('账号'));
  assert.ok(terms.includes('被封'));
  assert.ok(!terms.some((term) => term === '怎么办' || term === '了'));
});

test('queryTerms keeps Latin words next to Chinese and expands both', () => {
  const terms = queryTerms('shopify 广告怎么投');
  assert.ok(terms.includes('shopify'));
  assert.ok(terms.includes('广告'));
  assert.ok(!terms.includes('怎么'));
});

test('queryTerms treats full-width punctuation as a separator', () => {
  assert.deepEqual(queryTerms('ACOS，诊断！'), ['acos', '诊断']);
});

test('queryTerms drops filler verbs such as 避免', () => {
  const terms = queryTerms('长期仓储费怎么避免');
  assert.ok(terms.includes('长期仓储费'), terms.join(','));
  assert.ok(!terms.includes('避免'), terms.join(','));
});

test('clampText keeps short text unchanged', () => {
  assert.equal(clampText('abc', 10), 'abc');
});

test('clampText truncates and marks the cut', () => {
  const out = clampText('abcdefghij', 4);
  assert.equal(out, 'abcd…[truncated 6 chars]');
});
