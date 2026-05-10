import { db } from "./db";
import type { GrammarItem } from "./grammar-types";
import { JLPT_LEVELS } from "./types";

/**
 * 룰 패밀리 데이터 — 같은 ruleFamily 를 공유하는 grammarItems 모음.
 */

export type FamilyMember = {
  id: number;
  packKey: string;
  pattern: string;
  meaningsKo: string[];
  level: string; // "N5".."N1" 추출 (packKey "N5-grammar" → "N5"). 커스텀이면 packKey.
  isFoundation: boolean;
};

export type FamilyData = {
  /** family ID */
  id: string;
  /** 같은 family 의 모든 항목. 정렬: foundation 먼저, 그 후 level/position. */
  members: FamilyMember[];
  /** foundation 항목 (있으면). */
  foundation: GrammarItem | null;
  /** level별 카운트 (분포). */
  byLevel: Record<string, number>;
};

function levelOfPackKey(packKey: string): string {
  const m = /^([nN][1-5])-grammar$/.exec(packKey);
  return m ? m[1].toUpperCase() : packKey;
}

const LEVEL_RANK = new Map<string, number>(
  JLPT_LEVELS.map((k, i) => [k, i] as const),
);

export async function loadFamily(familyId: string): Promise<FamilyData> {
  const d = db();
  const items = await d.grammarItems.where("ruleFamily").equals(familyId).toArray();

  const byLevel: Record<string, number> = {};
  for (const it of items) {
    const lv = levelOfPackKey(it.packKey);
    byLevel[lv] = (byLevel[lv] ?? 0) + 1;
  }

  const foundationItem = items.find((it) => it.isFoundation === true) ?? null;

  const members: FamilyMember[] = items
    .map((it) => ({
      id: it.id,
      packKey: it.packKey,
      pattern: it.pattern,
      meaningsKo: it.meaningsKo,
      level: levelOfPackKey(it.packKey),
      isFoundation: it.isFoundation === true,
    }))
    .sort((a, b) => {
      // foundation 먼저
      if (a.isFoundation && !b.isFoundation) return -1;
      if (!a.isFoundation && b.isFoundation) return 1;
      // 그 후 level rank → 같으면 pattern
      const ra = LEVEL_RANK.get(a.level) ?? 99;
      const rb = LEVEL_RANK.get(b.level) ?? 99;
      if (ra !== rb) return ra - rb;
      return a.pattern.localeCompare(b.pattern);
    });

  return {
    id: familyId,
    members,
    foundation: foundationItem,
    byLevel,
  };
}

/** Home 진입용 — 각 family ID 별 멤버 카운트. */
export async function loadAllFamilyCounts(): Promise<Map<string, number>> {
  const d = db();
  const counts = new Map<string, number>();
  await d.grammarItems.each((it) => {
    if (!it.ruleFamily) return;
    counts.set(it.ruleFamily, (counts.get(it.ruleFamily) ?? 0) + 1);
  });
  return counts;
}
