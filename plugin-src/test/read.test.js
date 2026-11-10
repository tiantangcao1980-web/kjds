import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveInside, readCapped, readText } from '../lib/read.js';

const root = join(tmpdir(), 'sealeap-read-test');

test('resolveInside accepts a relative path inside the root', () => {
  const p = resolveInside(root, 'references/topic.md');
  assert.equal(p, join(root, 'references', 'topic.md'));
});

test('resolveInside rejects parent traversal', () => {
  assert.equal(resolveInside(root, '../secret.txt'), null);
});

test('resolveInside rejects traversal hidden inside a path', () => {
  assert.equal(resolveInside(root, 'references/../../secret.txt'), null);
});

test('resolveInside rejects absolute Windows paths', () => {
  assert.equal(resolveInside(root, 'C:/Windows/win.ini'), null);
  assert.equal(resolveInside(root, '\\\\server\\share\\x'), null);
});

test('resolveInside rejects absolute POSIX paths', () => {
  assert.equal(resolveInside(root, '/etc/passwd'), null);
});

test('readCapped returns text for a small file', async () => {
  await mkdir(root, { recursive: true });
  const file = join(root, 'small.md');
  await writeFile(file, 'hello', 'utf8');
  const out = await readCapped(file, 16);
  assert.equal(out.text, 'hello');
  assert.equal(out.tooLarge, false);
});

test('readCapped refuses a file over the byte cap', async () => {
  await mkdir(root, { recursive: true });
  const file = join(root, 'big.md');
  await writeFile(file, 'x'.repeat(64), 'utf8');
  const out = await readCapped(file, 16);
  assert.equal(out.tooLarge, true);
  assert.equal(out.size, 64);
  assert.equal(out.text, undefined);
  await rm(root, { recursive: true, force: true });
});

test('readText truncates a long file instead of refusing it', async () => {
  await mkdir(root, { recursive: true });
  const file = join(root, 'long.md');
  await writeFile(file, '字'.repeat(50), 'utf8');
  const out = await readText(file, { maxChars: 10 });
  assert.equal(out.truncated, true);
  assert.equal(out.size, 150);
  assert.equal(out.text, `${'字'.repeat(10)}…[truncated 40 chars]`);
  await rm(root, { recursive: true, force: true });
});

test('readText reports a short file as untruncated', async () => {
  await mkdir(root, { recursive: true });
  const file = join(root, 'short.md');
  await writeFile(file, 'hello', 'utf8');
  const out = await readText(file, { maxChars: 10 });
  assert.equal(out.truncated, false);
  assert.equal(out.text, 'hello');
  await rm(root, { recursive: true, force: true });
});

test('readText refuses a file over the byte cap', async () => {
  await mkdir(root, { recursive: true });
  const file = join(root, 'huge.md');
  await writeFile(file, 'x'.repeat(64), 'utf8');
  const out = await readText(file, { maxBytes: 16 });
  assert.equal(out.tooLarge, true);
  assert.equal(out.size, 64);
  await rm(root, { recursive: true, force: true });
});

test('readText refuses binary content', async () => {
  await mkdir(root, { recursive: true });
  const file = join(root, 'bin.dat');
  await writeFile(file, Buffer.from([0x41, 0x00, 0x42]));
  const out = await readText(file);
  assert.equal(out.binary, true);
  await rm(root, { recursive: true, force: true });
});
