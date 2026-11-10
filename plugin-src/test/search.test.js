import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchEntries, scoreEntry } from '../lib/search.js';

const entries = [
  {
    name: 'sealeap-amazon-acos-diagnostics',
    title: 'ACOS 诊断',
    description: '用核心指标、贡献毛利和单变量实验诊断 Amazon Ads ACOS。',
    categoryPath: ['amazon-official'],
    dir: 'amazon-official/sealeap-amazon-acos-diagnostics',
  },
  {
    name: 'sealeap-amazon-uploads-helper',
    title: 'Uploads helper',
    description: 'Bulk upload listings for Amazon sellers.',
    categoryPath: ['app', 'athena'],
    dir: 'app/athena/sealeap-amazon-uploads-helper',
  },
  {
    name: 'sealeap-shopify-selection',
    title: 'Shopify 选品',
    description: 'Shopify 选品与竞争分析。',
    categoryPath: ['shopify'],
    dir: 'shopify/sealeap-shopify-selection',
  },
];

test('search matches the name and ranks it first', () => {
  const out = searchEntries(entries, 'acos-diagnostics');
  assert.equal(out[0].name, 'sealeap-amazon-acos-diagnostics');
});

test('search matches a Chinese description term', () => {
  const out = searchEntries(entries, '选品');
  assert.deepEqual(out.map((e) => e.name), ['sealeap-shopify-selection']);
});

test('search is case-insensitive', () => {
  const out = searchEntries(entries, 'AMAZON ADS');
  assert.ok(out.length >= 1);
  assert.equal(out[0].name, 'sealeap-amazon-acos-diagnostics');
});

test('search does not match an ASCII term inside another word', () => {
  const out = searchEntries(entries, 'ads');
  assert.deepEqual(out.map((e) => e.name), ['sealeap-amazon-acos-diagnostics']);
});

test('search filters by category segment', () => {
  const out = searchEntries(entries, 'sealeap', { category: 'athena' });
  assert.deepEqual(out.map((e) => e.name), ['sealeap-amazon-uploads-helper']);
});

test('search honors the limit', () => {
  const out = searchEntries(entries, 'sealeap', { limit: 2 });
  assert.equal(out.length, 2);
});

test('search returns an empty list when nothing matches', () => {
  assert.deepEqual(searchEntries(entries, 'zzz-no-such-skill'), []);
});

test('an empty query lists every entry', () => {
  const out = searchEntries(entries, '');
  assert.equal(out.length, 3);
});

test('search uses the Chinese shortDescription field', () => {
  const withShort = [
    {
      name: 'sealeap-amazon-acos-diagnostics',
      title: 'Amazon Ads ACOS 核心指标诊断',
      shortDescription: '用核心指标、贡献毛利和单变量实验诊断 Amazon Ads ACOS',
      description: 'Diagnose Amazon Ads ACOS with CTR, CPC, CVR evidence.',
      categoryPath: ['amazon-official'],
    },
  ];
  const out = searchEntries(withShort, 'ACOS 诊断');
  assert.deepEqual(out.map((e) => e.name), ['sealeap-amazon-acos-diagnostics']);
});

test('search answers a colloquial Chinese question that has no whitespace', () => {
  const launch = [
    {
      name: 'sealeap-amazon-new-product-launch-plan',
      title: '新品上架推广计划',
      shortDescription: '新品怎么推：上架节奏、广告冷启动与评价积累',
      description: 'Plan a new product launch with a warming phase and early ads.',
      categoryPath: ['amazon-official'],
    },
    {
      name: 'sealeap-amazon-listing-seo',
      title: 'Listing SEO',
      shortDescription: '标题与关键词优化',
      description: 'Optimize listing titles and keywords.',
      categoryPath: ['amazon-official'],
    },
  ];
  const out = searchEntries(launch, '新品怎么推');
  assert.equal(out[0]?.name, 'sealeap-amazon-new-product-launch-plan');
});

test('search bridges a Chinese phrase to its English skill text', () => {
  const appeal = [
    {
      name: 'sealeap-amazon-account-appeal',
      title: 'Account suspension appeal',
      shortDescription: '账号被暂停后的申诉',
      description: 'Write an appeal after an account suspension; reinstate the selling account.',
      categoryPath: ['amazon-official'],
    },
    {
      name: 'sealeap-amazon-listing-seo',
      title: 'Listing SEO',
      shortDescription: '标题与关键词优化',
      description: 'Optimize listing titles and keywords.',
      categoryPath: ['amazon-official'],
    },
  ];
  const out = searchEntries(appeal, '账号被封了怎么办');
  assert.equal(out[0]?.name, 'sealeap-amazon-account-appeal');
});

test('scoreEntry caps one field so repetition cannot dominate', () => {
  const repeated = { name: 'x', description: `ads ${'ads '.repeat(20)}` };
  const normal = { name: 'x', description: `ads ads ads` };
  const once = { name: 'x', description: 'ads only once' };
  assert.equal(scoreEntry(repeated, ['ads']), scoreEntry(normal, ['ads']));
  assert.ok(scoreEntry(normal, ['ads']) > scoreEntry(once, ['ads']));
});

test('search prefers the entry matching a specific term over a repeated common one', () => {
  const corpus = [
    { name: 'sealeap-common-one', title: '广告 广告 广告', description: '广告 广告 广告', categoryPath: ['a'] },
    { name: 'sealeap-common-two', title: '广告 广告', description: '广告 广告', categoryPath: ['a'] },
    { name: 'sealeap-common-three', title: '广告', description: '广告', categoryPath: ['a'] },
    { name: 'sealeap-common-four', title: '广告', description: '广告', categoryPath: ['a'] },
    { name: 'sealeap-specific', title: '广告 清关', description: '清关流程与广告预算', categoryPath: ['a'] },
  ];
  const out = searchEntries(corpus, '广告 清关');
  assert.equal(out[0]?.name, 'sealeap-specific');
});

test('search prefers an entry covering both query terms over one repeating a single term', () => {
  const corpus = [
    { name: 'sealeap-one', title: '清关 清关 清关', description: '清关 清关 清关', categoryPath: ['a'] },
    { name: 'sealeap-two', title: '清关 仓储', description: '清关 仓储', categoryPath: ['a'] },
  ];
  const out = searchEntries(corpus, '清关 仓储');
  assert.equal(out[0]?.name, 'sealeap-two');
});

test('search bridges 二审 to the English account-verification skill', () => {
  const corpus = [
    {
      name: 'sealeap-baxia-amazon-video-verification-readiness',
      title: 'Video verification readiness',
      shortDescription: '视频认证前的资料与流程准备',
      description: 'Prepare documents for Amazon video verification and account review.',
      categoryPath: ['youtube', 'baxia'],
    },
    {
      name: 'sealeap-amazon-listing-seo',
      title: 'Listing SEO',
      description: 'Optimize listing titles and keywords.',
      categoryPath: ['amazon-official'],
    },
  ];
  const out = searchEntries(corpus, '二审怎么过');
  assert.equal(out[0]?.name, 'sealeap-baxia-amazon-video-verification-readiness');
});

test('search bridges 长期仓储费 to the English storage-fee skill', () => {
  const corpus = [
    {
      name: 'sealeap-amazon-fba-long-term-storage-fee',
      title: 'FBA long-term storage fee',
      shortDescription: '长期仓储费与库龄附加费的规避',
      description: 'Avoid long-term storage fees and aged inventory surcharges.',
      categoryPath: ['amazon-official'],
    },
    {
      name: 'sealeap-amazon-listing-seo',
      title: 'Listing SEO',
      description: 'Optimize listing titles and keywords.',
      categoryPath: ['amazon-official'],
    },
  ];
  const out = searchEntries(corpus, '长期仓储费怎么避免');
  assert.equal(out[0]?.name, 'sealeap-amazon-fba-long-term-storage-fee');
});

test('search matches a catalog tag such as a platform mode', () => {
  const tagged = [
    { name: 'sealeap-ebay-report', description: 'eBay 报表', categoryPath: ['ebay'], mode: 'advertising' },
  ];
  assert.deepEqual(searchEntries(tagged, 'advertising').map((e) => e.name), ['sealeap-ebay-report']);
});
