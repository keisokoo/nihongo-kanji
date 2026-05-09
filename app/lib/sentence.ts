import type { SentenceToken } from "./idb/types";

export type { SentenceToken };

const SENTENCE_TOKEN_RE = /\{\{([^}]+)\}\}|\{([^|}]+)\|([^|}]+)\}/g;

/**
 * Parse a sentence in inline-markup form into structured tokens.
 *
 *   {{kanji}}        → quiz target (rendered without ruby)
 *   {kanji|kana}     → ruby (`<ruby>kanji<rt>kana</rt></ruby>`)
 *   plain text       → as-is
 *
 * Throws if leftover braces survive parsing (malformed markup).
 */
export function parseSentence(md: string, where: string): SentenceToken[] {
  const tokens: SentenceToken[] = [];
  let last = 0;
  SENTENCE_TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SENTENCE_TOKEN_RE.exec(md))) {
    if (match.index > last) {
      tokens.push({ text: md.slice(last, match.index) });
    }
    if (match[1] !== undefined) {
      tokens.push({ text: match[1], target: true });
    } else {
      tokens.push({ text: match[2], reading: match[3] });
    }
    last = match.index + match[0].length;
  }
  if (last < md.length) tokens.push({ text: md.slice(last) });

  const flat = tokens.map((t) => t.text).join("");
  if (/[{}]/.test(flat)) {
    throw new Error(
      `${where}: leftover braces in sentence after parse — check markup: ${md}`,
    );
  }
  return tokens;
}

export function tokensToPlain(tokens: SentenceToken[]): string {
  return tokens.map((t) => t.text).join("");
}

/** Reconstruct markdown from tokens — used to feed Claude existing examples. */
export function tokensToMarkdown(tokens: SentenceToken[]): string {
  return tokens
    .map((t) => {
      if (t.target) return `{{${t.text}}}`;
      if (t.reading) return `{${t.text}|${t.reading}}`;
      return t.text;
    })
    .join("");
}
