/** Small pure text helpers shared by the plugin runtime and its tests. */

/** Matches one leading YAML frontmatter block, LF or CRLF. */
const FRONTMATTER = /^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;

/** Any CJK ideograph or kana, used to split mixed queries into runs. */
const CJK_CHAR = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

/** Punctuation, symbols and full-width forms that should separate terms. */
const NON_TERM = /[^\p{L}\p{N}\s+#]/gu;

/** Chinese filler words that carry no retrieval signal. Longest first. */
const STOPWORDS = [
  '可不可以', '是不是', '有没有', '怎么样', '怎么办', '为什么', '什么时候', '多少钱',
  '怎么', '如何', '什么', '哪些', '哪个', '哪里', '一下', '我的', '你的', '需要', '应该',
  '可以', '帮我', '请问', '告诉', '关于', '这个', '那个', '我们', '你们', '是否', '以及',
  '然后', '如果', '但是', '因为', '所以', '还有', '就是', '一个', '进行', '的话',
  '避免', '解决', '应对', '求助', '推荐', '建议', '最好', '最近', '平时', '一般', '现在',
  '到底', '究竟', '具体', '相关', '问题', '情况', '方面',
  '的', '了', '吗', '呢', '吧', '啊', '呀', '哦', '是', '在', '和', '与', '把', '给',
];

/**
 * Drop a leading YAML frontmatter block and trim the remaining body.
 * @param {string} markdown - raw SKILL.md content.
 * @returns {string} the model-facing body.
 */
export function stripFrontmatter(markdown) {
  return String(markdown ?? '').replace(FRONTMATTER, '').trim();
}

/**
 * Split a search query into lowercase terms.
 *
 * Latin runs become whole words; a Chinese run is stripped of stopwords and
 * then expanded into overlapping two-character bigrams plus the whole piece,
 * so an unspaced sentence such as `新品怎么推` can still match skill text.
 * @param {string} query - raw user/model query.
 * @returns {string[]} lowercase terms, empty strings removed.
 */
export function queryTerms(query) {
  const text = String(query ?? '')
    .toLowerCase()
    .replace(NON_TERM, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return [];

  const terms = [];
  const push = (term) => {
    if (term && !terms.includes(term)) terms.push(term);
  };

  for (const segment of text.split(' ')) {
    if (!segment) continue;
    for (const run of segment.split(new RegExp(`(${CJK_CHAR.source}+)`, 'u'))) {
      if (!run) continue;
      if (!CJK_CHAR.test(run)) {
        push(run);
        continue;
      }
      let cleaned = run;
      for (const word of STOPWORDS) cleaned = cleaned.split(word).join(' ');
      for (const piece of cleaned.split(/\s+/)) {
        if (piece.length < 2) continue;
        for (let index = 0; index + 2 <= piece.length; index += 1) push(piece.slice(index, index + 2));
        if (piece.length <= 8) push(piece);
      }
    }
  }
  return terms;
}

/**
 * Truncate text to a character budget, marking how much was dropped.
 * @param {string} text - text to clamp.
 * @param {number} max - maximum characters to keep.
 * @returns {string} the original text or a marked prefix.
 */
export function clampText(text, max) {
  const value = String(text ?? '');
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…[truncated ${value.length - max} chars]`;
}
