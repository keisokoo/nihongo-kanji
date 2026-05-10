/**
 * 사이드바 검색용 유틸. 한국어/일본어/영어 동시 검색.
 *
 * normalize 룰:
 * - 카타카나 → 히라가나 (ガッコウ ↔ がっこう 동등)
 * - 영문 소문자화
 * - 한국어/한자는 그대로 (NFC 정규화만)
 */

export function normalize(s: string): string {
  // NFC + 카타카나 → 히라가나 + lowercase
  return s
    .normalize("NFC")
    .replace(/[ァ-ヶ]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0x60),
    )
    .toLowerCase();
}

/**
 * `needle` 이 비어있으면 true (모두 통과). 그 외엔 어느 한 haystack 에라도
 * 부분일치하면 true.
 */
export function matchesAny(
  haystacks: ReadonlyArray<string | null | undefined>,
  needle: string,
): boolean {
  const n = normalize(needle.trim());
  if (!n) return true;
  for (const h of haystacks) {
    if (h && normalize(h).includes(n)) return true;
  }
  return false;
}
