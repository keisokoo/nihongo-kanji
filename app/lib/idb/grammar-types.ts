/**
 * 문법팩 도메인 타입.
 *
 * 한자팩 (types.ts) 과 별도 IDB 스토어를 사용. 데이터 모양이 충분히 달라서
 * (퀴즈가 5종 다형 payload, examples/quizzes 가 항목 단위로 묶임) 분리.
 *
 * Examples 와 Quizzes 는 GrammarItem 안에 임베디드 배열로 저장 — 항상 항목과
 * 같이 로드되고, 개별 row 로 인덱싱할 필요가 없어서 store 분리하지 않음.
 */
import type { SentenceToken } from "./types";

export type GrammarPackKind = "jlpt-grammar" | "custom-grammar";

export type GrammarLevel = "N5" | "N4" | "N3" | "N2" | "N1" | null;

export type GrammarCategory =
  | "verb_form"
  | "particle"
  | "expression"
  | "conjunction"
  | "auxiliary"
  | "honorific"
  | "ending"
  | "other";

export const GRAMMAR_CATEGORIES: readonly GrammarCategory[] = [
  "verb_form",
  "particle",
  "expression",
  "conjunction",
  "auxiliary",
  "honorific",
  "ending",
  "other",
] as const;

export type GrammarQuizType =
  | "conjugation"
  | "particle_blank"
  | "pattern_blank"
  | "form_meaning"
  | "ko_to_jp_form";

export type ConjugationGroup =
  | "godan"
  | "ichidan"
  | "irregular"
  | "i_adj"
  | "na_adj"
  | "noun"
  | "any";

export type ConjugationPayload = {
  dictForm: string;
  group: ConjugationGroup;
  targetFormLabel: string;
  answer: string;
  distractors: string[];
  hintKo: string | null;
};

export type BlankPayload = {
  /** 인라인 마크업. {{...}} 안 텍스트가 정답 (검증됨). */
  sentence: string;
  answer: string;
  distractors: string[];
  translationKo: string;
};

export type FormMeaningPayload = {
  /** 인라인 마크업 가능 (ruby OK). target 0~1개. */
  prompt: string;
  /** 선택. 인라인 마크업 가능. target 0~1개. */
  contextSentence: string | null;
  /** plain 한국어. */
  answer: string;
  /** plain 한국어. */
  distractors: string[];
};

export type KoToJpFormPayload = {
  ko: string;
  /** 인라인 마크업, target 1개 (그 패턴이 사용된 위치). */
  answer: string;
  /** 인라인 마크업, target 1개. */
  distractors: string[];
  hintKo: string | null;
};

/** AI 해설 + source 는 quiz type 과 무관하게 동일 모양 — 별도 필드. */
type WithMeta = {
  explanation?: GrammarQuizExplanation | null;
  /** seed: 시드 퀴즈. generated: 사용자가 AI 로 추가. */
  source?: "seed" | "generated";
};

export type GrammarQuiz = WithMeta &
  (
    | { type: "conjugation"; payload: ConjugationPayload }
    | { type: "particle_blank"; payload: BlankPayload }
    | { type: "pattern_blank"; payload: BlankPayload }
    | { type: "form_meaning"; payload: FormMeaningPayload }
    | { type: "ko_to_jp_form"; payload: KoToJpFormPayload }
  );

export type GrammarItemDeepExplanation = {
  /** 언제 쓰는지 구체적 상황 */
  whenToUse: string;
  /** 비슷한 표현과의 차이 */
  comparison: string;
  /** 자주 틀리는 점 */
  commonMistakes: string;
  /** 핵심 학습 포인트 */
  takeaways: string;
  modelUsed: string;
  createdAt: string;
};

/**
 * 활용 가이드 — 패턴별 그룹·용법·비교 등을 sections 단위로 구조화.
 *
 * 6가지 유형 커버 (verb_form 그룹별 / 다의 / 비교 / 활용규칙 / 격식 / 단순부사)
 * 모두 같은 sections 모양으로 표현. AI 가 패턴 카테고리·의미를 보고
 * 적절한 sections 구성.
 */
export type GrammarUsageGuide = {
  intro: string;
  sections: GrammarUsageSection[];
  modelUsed: string;
  createdAt: string;
};

export type GrammarUsageSection = {
  /** 섹션 제목 (예: "1그룹 (5단)" / "장소" / "から과의 차이" / "동사 활용" 등). */
  title: string;
  /** 핵심 규칙·의미·차이 1-3 문장. */
  rule: string;
  examples: GrammarUsageExample[];
  /** 추가 설명 (예외·주의·tip). */
  note: string | null;
};

export type GrammarUsageExample = {
  /** 일본어 예. 인라인 마크업 OK ({한자|reading}). target {{}} 사용 X. */
  jp: string;
  /** (선택) 가나/로마자 — jp 가 한자만 있을 때 발음 표시. */
  jpReading: string | null;
  /** (선택) 변형 결과 — 그룹별 활용일 때 사전형 → ます형 매핑. */
  conjugated: string | null;
  /** 한국어 의미. */
  gloss: string;
};

export type GrammarExampleExplanation = {
  nuance: string;
  grammar: string;
  pronunciation: string;
  takeaways: string;
  modelUsed: string;
  createdAt: string;
};

export type GrammarQuizExplanation = {
  /** 문제 / 예문의 구조 분석 */
  promptAnalysis: string;
  /** 정답 명시 (텍스트 그대로) */
  correctAnswer: string;
  /** 왜 정답인지 */
  whyCorrect: string;
  /** 다른 선택지가 왜 틀리는지 */
  whyOthersWrong: string;
  modelUsed: string;
  createdAt: string;
};

export type GrammarExample = {
  /** 인라인 마크업. target 1개 — 그 패턴이 사용된 부분. */
  sentence: string;
  sentenceTranslationKo: string;
  note: string | null;
  /** seed: 시드에 들어있던 예문. generated: 사용자가 AI 로 추가. */
  source?: "seed" | "generated";
  /** AI 해설 — lazy 로 생성·캐시. */
  explanation?: GrammarExampleExplanation | null;
};

/** 문법 시험 row. */
export type GrammarTest = {
  id: number;
  name: string;
  /** 시험을 만들 때 선택한 grammar pack key 들 (denormalized). */
  sourcePacks: string[];
  total: number;
  createdAt: Date;
};

/**
 * 문법 시험의 한 문제 row.
 *
 * 시험 만들 때 sourceItem 의 quizzes 중 하나를 무작위로 골라 snapshot.
 * 그 후 source 가 변경/삭제 돼도 시험은 stable.
 */
export type GrammarTestItem = {
  id: number;
  testId: number;
  position: number;

  /** 출처 grammar item — 표시·내비용. 삭제되면 null. */
  sourceItemId: number | null;
  /** 출처 quiz 의 인덱스 (item.quizzes[quizIndex]). reference 용. */
  sourceQuizIndex: number;

  /** 시험 만든 시점의 quiz snapshot (answer/distractors 포함). */
  quizSnapshot: GrammarQuiz;

  /** 항목 표시용 (denormalized). */
  pattern: string;
  meaningsKo: string[];

  /** 답안 상태. */
  pickedChoice: string | null;
  isCorrect: boolean | null;
  answeredAt: Date | null;
};

/**
 * IDB row.
 */
export type GrammarPack = {
  key: string; // primary key (e.g. "N5-grammar", custom slug)
  title: string;
  kind: GrammarPackKind;
  level: GrammarLevel;
  description: string | null;
  createdAt: Date;
};

export type GrammarItem = {
  id: number; // ++id
  packKey: string; // index
  position: number; // ordering within pack (1-based, mirrors seed `no`)
  pattern: string; // unique within pack
  romaji: string | null;
  ref: string | null;
  refOriginalEn: string | null;

  meaningsKo: string[];
  category: GrammarCategory;
  explanation: string;
  formation: string | null;
  notes: string | null;
  applicableQuizTypes: GrammarQuizType[];

  examples: GrammarExample[];
  quizzes: GrammarQuiz[];

  /** AI 가 생성하는 항목 단위 deep explanation (선택). */
  deepExplanation?: GrammarItemDeepExplanation | null;
  /** AI 가 생성하는 활용 가이드 (선택). */
  usageGuide?: GrammarUsageGuide | null;

  /**
   * 같은 변형/사용 룰을 공유하는 family ID. 항목간 그룹화 용.
   * 예: "verb:masu" / "adj:i" / "particle:limit". null = 단독.
   * Family ID 목록은 app/lib/grammar-families.ts 의 RULE_FAMILIES 레지스트리.
   */
  ruleFamily?: string | null;
  /**
   * 이 항목이 family 의 기초 (변형 규칙 정의자) 인지.
   * true 인 항목은 family 페이지의 헤드 카드 + 그룹별 변형 규칙 풀 가이드.
   * derived 항목은 foundation 참조 링크만.
   */
  isFoundation?: boolean;

  createdAt: Date;
};

/**
 * Seed JSON shape — what scripts/data/grammar-{level}.json contains.
 */
export type GrammarSeedFile = {
  key: string;
  title: string;
  kind: GrammarPackKind;
  level: GrammarLevel;
  description: string | null;
  items: GrammarSeedItem[];
};

export type GrammarSeedItem = {
  no: number;
  pattern: string;
  romaji: string | null;
  ref: string | null;
  refOriginalEn: string | null;
  meaningsKo: string[];
  category: GrammarCategory;
  explanation: string;
  formation: string | null;
  notes: string | null;
  applicableQuizTypes: GrammarQuizType[];
  examples: GrammarExample[];
  quizzes: GrammarQuiz[];
  /** 룰 family ID — RULE_FAMILIES 안의 값. 단독 항목은 null. */
  ruleFamily?: string | null;
  /** family 의 기초 항목인지. */
  isFoundation?: boolean;
};

/**
 * Parser 가 처리한 sentence — 렌더 컴포넌트에서 SentenceToken[] 으로 변환.
 * (인라인 마크업 → SentenceToken[] 은 app/lib/sentence.ts 의 parseSentence).
 */
export type { SentenceToken };
