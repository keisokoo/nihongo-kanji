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
};

/**
 * Parser 가 처리한 sentence — 렌더 컴포넌트에서 SentenceToken[] 으로 변환.
 * (인라인 마크업 → SentenceToken[] 은 app/lib/sentence.ts 의 parseSentence).
 */
export type { SentenceToken };
