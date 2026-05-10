/**
 * 룰 패밀리 레지스트리.
 *
 * 같은 변형 규칙·사용 패턴을 공유하는 항목들을 묶기 위한 ID 목록 + 메타.
 * GrammarItem.ruleFamily 가 이 ID 중 하나를 참조.
 *
 * Family 페이지 (`/family/:familyId`) 에서 이 메타로 헤더 + foundation 카드 +
 * derived 항목 grid 를 그림.
 */

export type RuleFamilyGroup =
  | "verb"
  | "adj"
  | "copula"
  | "particle"
  | "conjunction"
  | "conditional"
  | "guess"
  | "honorific"
  | "ending";

export type RuleFamilyMeta = {
  id: string;
  title: string;
  description: string;
  group: RuleFamilyGroup;
  /** 학습 권장 순서 (낮을수록 먼저). */
  order: number;
};

export const RULE_FAMILIES: RuleFamilyMeta[] = [
  // ── 동사 활용 (verb conjugation) ──
  {
    id: "verb:masu",
    title: "ます형 (정중형)",
    description:
      "동사 정중형. 1/2/3그룹별 변형 규칙 — 대부분의 정중 표현의 기반.",
    group: "verb",
    order: 1,
  },
  {
    id: "verb:te",
    title: "て형 (연결형)",
    description:
      "동사 연결형. 〜ている / 〜てもいい / 〜てしまう 등 다양한 보조 동사·표현의 기반.",
    group: "verb",
    order: 2,
  },
  {
    id: "verb:nai",
    title: "ない형 (부정형)",
    description: "동사 부정형. 〜ないでください, 〜なくてはならない 등의 기반.",
    group: "verb",
    order: 3,
  },
  {
    id: "verb:ta",
    title: "た형 (과거형)",
    description: "동사 과거형. 〜たことがある, 〜たばかり, 〜たら 등의 기반.",
    group: "verb",
    order: 4,
  },
  {
    id: "verb:dict",
    title: "사전형 (보통체 현재)",
    description:
      "동사의 기본형. 〜ことができる, 〜つもり, 〜ところだ 등의 기반.",
    group: "verb",
    order: 5,
  },
  {
    id: "verb:ba",
    title: "조건형 (~ば)",
    description: "ば 조건형. 가정·조건의 핵심 활용.",
    group: "verb",
    order: 6,
  },
  {
    id: "verb:volitional",
    title: "의지형 (~う / よう)",
    description: "〜よう / 〜ようと思う / 〜ようとする 등의 기반.",
    group: "verb",
    order: 7,
  },
  {
    id: "verb:potential",
    title: "가능형 (~られる / ~ える)",
    description: "동사 가능형. 〜られる (가능) 형태와 사용처.",
    group: "verb",
    order: 8,
  },
  {
    id: "verb:passive",
    title: "수동형 (受身形)",
    description: "수동·피동 변형. 직접·간접 수동의 사용.",
    group: "verb",
    order: 9,
  },
  {
    id: "verb:causative",
    title: "사역형 (使役形)",
    description: "사역 〜せる / 〜させる. 강제·허락 두 가지 의미.",
    group: "verb",
    order: 10,
  },
  {
    id: "verb:causative-passive",
    title: "사역수동 (~させられる)",
    description: "사역수동 결합형. 강제로 ~하게 됨.",
    group: "verb",
    order: 11,
  },
  {
    id: "verb:imperative",
    title: "명령·금지형",
    description: "직접 명령 (~ろ / ~なさい), 금지 (~るな).",
    group: "verb",
    order: 12,
  },

  // ── 형용사 활용 (adjective forms) ──
  {
    id: "adj:i",
    title: "い형용사 활용",
    description:
      "い형용사의 시제·부정·연결 변형 (~い / ~くない / ~かった / ~くて / ~く).",
    group: "adj",
    order: 20,
  },
  {
    id: "adj:na",
    title: "な형용사 활용",
    description:
      "な형용사의 시제·부정·연결·수식 (~だ / ~じゃない / ~で / ~な + 명사).",
    group: "adj",
    order: 21,
  },

  // ── copula (단정·정중) ──
  {
    id: "copula",
    title: "だ / です family",
    description:
      "단정 표현. 〜だ/だった/じゃない/じゃなかった ↔ 〜です/でした/じゃありません 등.",
    group: "copula",
    order: 30,
  },

  // ── 조사 family ──
  {
    id: "particle:basic-case",
    title: "기본 격조사 (の / を / に / へ / で / と / から)",
    description:
      "문장 구조의 뼈대 — 명사 간 관계·역할을 표시하는 기본 조사들.",
    group: "particle",
    order: 39,
  },
  {
    id: "particle:topic-subject",
    title: "주제·주격 (は / が)",
    description: "は 와 が 의 사용 구분 — 신·구 정보, 강조, 대비.",
    group: "particle",
    order: 40,
  },
  {
    id: "particle:limit",
    title: "한정 조사 (だけ / ばかり / しか / のみ / きり)",
    description: "한정·제한·정도를 표현하는 조사 family. 미묘한 차이 학습.",
    group: "particle",
    order: 41,
  },
  {
    id: "particle:example",
    title: "예시·열거 (など / なんか / とか / やら)",
    description: "예시·열거 표현. 격식·회화체·뉘앙스 차이.",
    group: "particle",
    order: 42,
  },
  {
    id: "particle:comparison",
    title: "비교·정도 (より / ほど / くらい / ぐらい)",
    description: "비교 기준·정도·추측에 쓰이는 조사들.",
    group: "particle",
    order: 43,
  },
  {
    id: "particle:scope",
    title: "범위·기한 (まで / までに)",
    description: "도달점 vs 기한의 미묘한 차이.",
    group: "particle",
    order: 44,
  },

  // ── 접속 family ──
  {
    id: "conjunction:reason",
    title: "이유·원인 (から / ので / し / ため)",
    description: "이유 표현 family. 객관성·격식·열거 차이.",
    group: "conjunction",
    order: 50,
  },
  {
    id: "conjunction:contrast",
    title: "역접 (が / けど / のに / ても / しかし / でも)",
    description: "역접·반대를 나타내는 표현들. 격식·뉘앙스 차이.",
    group: "conjunction",
    order: 51,
  },
  {
    id: "conjunction:listing",
    title: "나열·추가 (そして / それから / また / それに)",
    description: "사건·사항 나열·추가 표현.",
    group: "conjunction",
    order: 52,
  },

  // ── 조건 family ──
  {
    id: "conditional",
    title: "조건 (ば / と / たら / なら)",
    description:
      "4가지 조건 표현. 일반·자연·계기·화제 — 각각의 사용 영역 구분.",
    group: "conditional",
    order: 60,
  },

  // ── 추측·전문 family ──
  {
    id: "guess",
    title: "추측·전문 (ようだ / そうだ / らしい / だろう / でしょう / かもしれない / はず)",
    description:
      "확신·근거에 따른 추측 표현 강도 — 객관·주관·전문·확률·당연 등.",
    group: "guess",
    order: 70,
  },

  // ── 경어 family ──
  {
    id: "honorific:respect",
    title: "존경어 (尊敬語)",
    description:
      "상대를 높이는 표현. お~になる / いらっしゃる / なさる / 〜られる 등.",
    group: "honorific",
    order: 80,
  },
  {
    id: "honorific:humble",
    title: "겸양어 (謙譲語)",
    description: "본인을 낮추는 표현. お~する / いたす / 申す / 参る 등.",
    group: "honorific",
    order: 81,
  },
  {
    id: "honorific:polite",
    title: "정중어 (丁寧語)",
    description: "정중하게 말하는 표현. ございます / でございます 등.",
    group: "honorific",
    order: 82,
  },

  // ── 종조사 family ──
  {
    id: "ending:question",
    title: "의문 종조사 (か / かい / かな / かしら)",
    description: "질문·추측의 종조사. 격식·성별·뉘앙스 구분.",
    group: "ending",
    order: 90,
  },
  {
    id: "ending:emphasis",
    title: "강조 종조사 (よ / ぞ / ぜ)",
    description: "정보 제공·강조의 종조사. 회화체·성별 차이.",
    group: "ending",
    order: 91,
  },
  {
    id: "ending:emotion",
    title: "감탄·확인 종조사 (ね / なあ / わ)",
    description: "동의·감탄·여성적 표현 등 감정 종조사.",
    group: "ending",
    order: 92,
  },
];

export const RULE_FAMILY_BY_ID = new Map<string, RuleFamilyMeta>(
  RULE_FAMILIES.map((f) => [f.id, f]),
);

export const FAMILY_GROUP_LABELS: Record<RuleFamilyGroup, string> = {
  verb: "동사 활용",
  adj: "형용사 활용",
  copula: "단정·정중",
  particle: "조사",
  conjunction: "접속",
  conditional: "조건",
  guess: "추측·전문",
  honorific: "경어",
  ending: "종조사",
};
