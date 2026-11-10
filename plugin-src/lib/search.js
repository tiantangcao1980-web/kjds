/** Lexical ranking over the packaged skill catalog. */
import { queryTerms } from './text.js';

/** Weight of a term occurrence per searchable field. */
const FIELD_WEIGHTS = { name: 6, title: 4, shortDescription: 5, description: 3, category: 2, tags: 2 };

/** Occurences beyond this per field stop adding score, so repetition cannot win. */
const FIELD_CAP = 3;

/** Weight of a synonym expansion relative to the term the query actually used. */
const SYNONYM_WEIGHT = 0.6;

/** Reward for covering more distinct query terms, not just repeating one. */
const COVERAGE_BONUS = 0.3;

/** Chinese运营术语 → the English words the skill libraries use (and back). */
const SYNONYMS = {
  选品: ['selection', 'product research', 'screening', 'niche'],
  竞品: ['competitor', 'competition'],
  市场容量: ['market size', 'market demand'],
  广告: ['ads', 'advertising', 'campaign', 'ppc', 'sponsored'],
  投放: ['campaign', 'advertising', 'ads'],
  关键词: ['keyword', 'search term'],
  埋词: ['keyword', 'indexing'],
  listing: ['listing', 'product page'],
  类目: ['category', 'node'],
  变体: ['variation', 'parent child'],
  主图: ['main image', 'hero image'],
  库存: ['inventory', 'stock', 'fba inventory'],
  库龄: ['inventory age', 'aged inventory'],
  冗余库存: ['excess inventory'],
  滞销: ['slow moving', 'unsold', 'aged inventory'],
  补货: ['restock', 'replenish', 'replenishment'],
  清库存: ['clearance', 'liquidation', 'inventory'],
  断货: ['stockout', 'out of stock'],
  备货: ['stocking', 'inventory planning'],
  合规: ['compliance', 'policy'],
  申诉: ['appeal', 'reinstatement'],
  封号: ['suspension', 'appeal', 'account health'],
  被封: ['suspension', 'appeal'],
  冻结: ['freeze', 'hold', 'suspension'],
  二审: ['second review', 'account review', 'verification', 'appeal'],
  绩效: ['performance', 'account health'],
  跟卖: ['hijacker', 'hijacking', 'unauthorized listing'],
  利润: ['profit', 'margin', 'contribution'],
  毛利: ['gross margin', 'margin'],
  定价: ['pricing', 'price'],
  涨价: ['price increase', 'pricing'],
  回款: ['payout', 'settlement'],
  结算: ['settlement', 'payout'],
  客单价: ['average order value', 'aov'],
  差评: ['negative review', 'review'],
  改评: ['review update', 'review'],
  测评: ['review', 'creator', 'influencer'],
  退货: ['return', 'refund'],
  退货率: ['return rate', 'refund rate'],
  售后: ['after-sales', 'customer service', 'return'],
  客服: ['customer service', 'customer support'],
  邮件: ['email', 'template'],
  秒杀: ['deal', 'lightning deal', 'promotion'],
  促销: ['promotion', 'deal', 'coupon'],
  优惠券: ['coupon', 'promotion'],
  新品: ['new product', 'launch', 'new listing'],
  推新: ['launch', 'new product'],
  冷启动: ['launch', 'cold start', 'ramp'],
  转化率: ['conversion', 'cvr'],
  点击率: ['ctr', 'click through rate'],
  曝光: ['impression', 'impressions'],
  流量: ['traffic'],
  优化: ['optimization', 'optimize', 'improve', 'improvement'],
  标题: ['title', 'headline'],
  五点: ['bullet', 'bullet points'],
  图片: ['image', 'creative'],
  视频: ['video', 'creative'],
  报表: ['report', 'reporting'],
  税务: ['tax', 'vat'],
  商标: ['trademark', 'brand registry'],
  专利: ['patent'],
  侵权: ['infringement', 'ip complaint', 'intellectual property'],
  认证: ['certification', 'certificate'],
  检测: ['testing', 'test report'],
  包装: ['packaging'],
  召回: ['recall'],
  清关: ['customs', 'clearance'],
  头程: ['first leg', 'freight', 'forwarder'],
  海外仓: ['overseas warehouse', '3pl', 'warehouse'],
  仓储费: ['storage fee', 'storage fees'],
  长期仓储费: ['long-term storage', 'storage fee', 'aged inventory'],
  站外: ['offsite', 'external traffic'],
  站内: ['onsite', 'sponsored products'],
  季节性: ['seasonal', 'seasonality'],
  黑五: ['black friday'],
  网一: ['cyber monday'],
  私域: ['private domain', 'community', 'owned audience'],
  种草: ['seeding', 'recommendation', 'creator'],
  带货: ['livestream', 'live commerce', 'selling'],
  直播: ['livestream', 'live commerce', 'live'],
  购物车: ['buy box', 'featured offer'],
  独立站: ['shopify', 'dtc', 'storefront', 'independent site'],
  开店: ['onboarding', 'registration', 'open store'],
  入驻: ['onboarding', 'registration', 'enrollment'],
  上架: ['listing', 'publish', 'upload'],
  佣金: ['commission', 'fee'],
  账号限制: ['account restriction', 'limits'],
  归因: ['attribution'],
  物流: ['logistics', 'fulfillment', 'shipping'],
  铺货: ['dropshipping', 'bulk listing'],
  欧代: ['authorized representative', 'responsible person'],
};

const ASCII_TERM = /^[\x00-\x7f]+$/;

/** Escape one literal for use inside a RegExp. */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Count occurrences of one lowercase term in text.
 * ASCII terms match on word boundaries so `ads` does not match `uploads`;
 * other scripts match as plain substrings, which is what CJK queries need.
 * @param {string} haystack - searchable field text.
 * @param {string} term - lowercase query term.
 * @returns {number} occurrence count.
 */
export function occurrences(haystack, term) {
  if (!haystack) return 0;
  const text = String(haystack).toLowerCase();
  if (ASCII_TERM.test(term)) {
    const pattern = new RegExp(`(?<![a-z0-9])${escapeRegExp(term)}(?![a-z0-9])`, 'g');
    return (text.match(pattern) ?? []).length;
  }
  let count = 0;
  let index = 0;
  while ((index = text.indexOf(term, index)) !== -1) {
    count += 1;
    index += term.length;
  }
  return count;
}

/**
 * Expand query terms with domain synonyms and weights.
 * @param {string[]} terms - terms from queryTerms.
 * @returns {{term: string, weight: number}[]} deduplicated weighted terms.
 */
export function expandTerms(terms) {
  const expanded = [];
  const seen = new Map();
  const add = (term, weight) => {
    const key = String(term).toLowerCase();
    if (!key) return;
    const previous = seen.get(key);
    if (previous === undefined) {
      seen.set(key, expanded.length);
      expanded.push({ term: key, weight });
      return;
    }
    expanded[previous].weight = Math.max(expanded[previous].weight, weight);
  };

  for (const term of terms) {
    add(term, 1);
    for (const synonym of SYNONYMS[term] ?? []) add(synonym, SYNONYM_WEIGHT);
    for (const [chinese, synonyms] of Object.entries(SYNONYMS)) {
      if (synonyms.includes(term)) add(chinese, SYNONYM_WEIGHT);
      // Chinese queries arrive as bigrams/pieces, so bridge when a known key sits inside the term
      // (e.g. 提高转化率 still reaches the 转化率 → conversion bridge).
      if (term.length > chinese.length && term.includes(chinese)) {
        for (const synonym of synonyms) add(synonym, SYNONYM_WEIGHT);
      }
    }
  }
  return expanded;
}

/** The searchable text fields of one catalog entry. */
function entryFields(entry) {
  return {
    name: entry.name ?? '',
    title: entry.title ?? '',
    shortDescription: entry.shortDescription ?? '',
    description: entry.description ?? '',
    category: (entry.categoryPath ?? []).join(' '),
    tags: [entry.mode ?? '', entry.lang ?? '', ...(entry.tags ?? [])].filter(Boolean).join(' '),
  };
}

/**
 * Inverse document frequency for one query term.
 * A term present in every candidate contributes almost nothing, while a term
 * shared by a handful of skills dominates — this is what keeps a generic word
 * such as `广告` from outranking the one skill that also answers `清关`.
 * @param {number} df - number of candidate entries containing the term.
 * @param {number} total - candidate entry count.
 * @returns {number} positive weight multiplier.
 */
function inverseDocumentFrequency(df, total) {
  return Math.log((total + 2) / (df + 1)) + 0.3;
}

/**
 * Score one catalog entry, also reporting how many distinct terms it covered.
 * @param {object} entry - catalog entry.
 * @param {(string|{term: string, weight: number})[]} terms - query terms.
 * @returns {{score: number, matched: number}} weighted score and distinct term count.
 */
function scoreParts(entry, terms) {
  const fields = entryFields(entry);
  let score = 0;
  let matched = 0;
  for (const raw of terms) {
    const term = typeof raw === 'string' ? { term: raw, weight: 1 } : raw;
    let gain = 0;
    for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
      const count = Math.min(occurrences(fields[field], term.term), FIELD_CAP);
      gain += weight * count * term.weight;
    }
    if (gain > 0) matched += 1;
    score += gain;
  }
  return { score, matched };
}

/**
 * Score one catalog entry against query terms.
 * @param {object} entry - catalog entry with name/title/shortDescription/description/categoryPath.
 * @param {(string|{term: string, weight: number})[]} terms - query terms.
 * @returns {number} summed weighted, capped occurrences.
 */
export function scoreEntry(entry, terms) {
  return scoreParts(entry, terms).score;
}

/**
 * Filter, rank, and cap catalog entries.
 * An empty query is list mode: every (optionally filtered) entry, name-sorted.
 * @param {object[]} entries - catalog entries.
 * @param {string} query - raw query.
 * @param {{limit?: number, category?: string|null}} [options] - cap and category filter.
 * @returns {object[]} ranked entries.
 */
export function searchEntries(entries, query, options = {}) {
  const { limit = 8, category = null } = options;
  const terms = expandTerms(queryTerms(query));
  const wanted = category === null || category === undefined ? null : String(category).toLowerCase();

  const filtered = wanted === null
    ? entries
    : entries.filter((entry) => (entry.categoryPath ?? []).some((segment) => String(segment).toLowerCase() === wanted));

  if (terms.length === 0) {
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit);
  }

  // Document frequency is measured on the candidate set, so a category filter
  // also re-tunes which terms count as specific.
  const fields = filtered.map((entry) => entryFields(entry));
  const weighted = terms.map((term) => {
    const df = fields.reduce(
      (count, row) => count + (Object.values(row).some((value) => occurrences(value, term.term) > 0) ? 1 : 0),
      0,
    );
    return { term: term.term, weight: term.weight * inverseDocumentFrequency(df, filtered.length) };
  });

  return filtered
    .map((entry) => {
      const { score, matched } = scoreParts(entry, weighted);
      return { entry, score, matched };
    })
    .filter((scored) => scored.score > 0)
    .map((scored) => ({ ...scored, adjusted: scored.score * (1 + COVERAGE_BONUS * Math.max(0, scored.matched - 1)) }))
    .sort((a, b) => b.adjusted - a.adjusted || a.entry.name.localeCompare(b.entry.name))
    .slice(0, limit)
    .map((scored) => scored.entry);
}
