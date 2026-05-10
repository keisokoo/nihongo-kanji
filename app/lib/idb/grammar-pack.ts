import { db } from "./db";
import { isJlptLevel, type JlptLevel } from "./types";
import { parseSentence } from "../sentence";
import type {
  GrammarLevel,
  GrammarPack,
  GrammarPackKind,
  GrammarSeedFile,
  GrammarSeedItem,
} from "./grammar-types";

export type GrammarImportStats = {
  items: number;
  examples: number;
  quizzes: number;
};

export type GrammarImportResult = {
  pack: GrammarPack;
  stats: GrammarImportStats;
};

const SLUG_RE = /[^a-z0-9가-힣ぁ-んァ-ヶ一-龯-]+/g;

function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(SLUG_RE, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function isJlptGrammarKey(key: string): key is `${JlptLevel}-grammar` {
  const m = /^([nN][1-5])-grammar$/.exec(key);
  return !!m && isJlptLevel(m[1]);
}

function validateInput(
  input: GrammarSeedFile,
  allowJlpt: boolean,
): { key: string; title: string; kind: GrammarPackKind; level: GrammarLevel } {
  const title = input.title?.trim();
  if (!title) throw new Error("title is required");

  const explicitKey = input.key?.trim();
  const derivedKey = slugify(title) || slugify(explicitKey ?? "") || "grammar";
  const key = explicitKey || derivedKey;

  const isJlpt = isJlptGrammarKey(key);
  const kind: GrammarPackKind =
    input.kind ?? (isJlpt ? "jlpt-grammar" : "custom-grammar");

  if (kind === "jlpt-grammar" && !allowJlpt) {
    throw new Error(
      `JLPT 키 (${key}) 는 시스템 예약어입니다. 커스텀 문법팩은 N{1..5}-grammar 가 아닌 다른 키를 사용하세요.`,
    );
  }
  if (kind === "custom-grammar" && isJlpt) {
    throw new Error(
      `커스텀 문법팩의 키는 N{1..5}-grammar 형식이 될 수 없습니다.`,
    );
  }
  if (kind === "jlpt-grammar" && !isJlpt) {
    throw new Error(
      `kind=jlpt-grammar 인 경우 key 는 N{1..5}-grammar 여야 합니다 (받은 값: ${key})`,
    );
  }

  const level: GrammarLevel = input.level ?? null;

  return { key, title, kind, level };
}

/**
 * Validate that all sentence-markup strings parse cleanly. Throws on first
 * malformed sentence so an import never lands partial.
 */
function validateMarkup(items: GrammarSeedItem[]): void {
  for (const it of items) {
    for (const [i, ex] of (it.examples ?? []).entries()) {
      // Will throw on malformed braces.
      parseSentence(ex.sentence, `${it.pattern} / examples[${i}]`);
    }
    for (const [i, q] of (it.quizzes ?? []).entries()) {
      const where = `${it.pattern} / quizzes[${i}]`;
      const p = q.payload as Record<string, unknown>;
      if (q.type === "particle_blank" || q.type === "pattern_blank") {
        if (typeof p.sentence === "string") {
          parseSentence(p.sentence, `${where}.sentence`);
        }
      } else if (q.type === "form_meaning") {
        if (typeof p.prompt === "string") {
          parseSentence(p.prompt, `${where}.prompt`);
        }
        if (typeof p.contextSentence === "string") {
          parseSentence(p.contextSentence, `${where}.contextSentence`);
        }
      } else if (q.type === "ko_to_jp_form") {
        if (typeof p.answer === "string") {
          parseSentence(p.answer, `${where}.answer`);
        }
        if (Array.isArray(p.distractors)) {
          for (const [j, d] of (p.distractors as string[]).entries()) {
            if (typeof d === "string") {
              parseSentence(d, `${where}.distractors[${j}]`);
            }
          }
        }
      }
    }
  }
}

/**
 * Replace-style import. Each item with the same (packKey, pattern) gets
 * replaced. Wrapped in a Dexie transaction.
 */
export async function importGrammarPack(
  input: GrammarSeedFile,
  opts: { allowJlpt: boolean } = { allowJlpt: false },
): Promise<GrammarImportResult> {
  if (!Array.isArray(input.items)) {
    throw new Error("items array is required");
  }

  const { key, title, kind, level } = validateInput(input, opts.allowJlpt);

  // Pre-flight markup check — we don't want a half-applied pack on bad data.
  validateMarkup(input.items);

  const stats: GrammarImportStats = { items: 0, examples: 0, quizzes: 0 };
  const d = db();
  let resultPack!: GrammarPack;

  await d.transaction("rw", [d.grammarPacks, d.grammarItems], async () => {
    const existing = await d.grammarPacks.get(key);
    if (existing) {
      if (existing.kind !== kind) {
        throw new Error(
          `key "${key}" is already a ${existing.kind} pack — cannot change kind`,
        );
      }
      const updated: GrammarPack = {
        ...existing,
        title,
        level,
        description: input.description ?? existing.description,
      };
      await d.grammarPacks.put(updated);
      resultPack = updated;
    } else {
      const created: GrammarPack = {
        key,
        title,
        kind,
        level,
        description: input.description ?? null,
        createdAt: new Date(),
      };
      await d.grammarPacks.put(created);
      resultPack = created;
    }

    for (const seedItem of input.items) {
      const existingItem = await d.grammarItems
        .where("[packKey+pattern]")
        .equals([key, seedItem.pattern])
        .first();
      if (existingItem?.id !== undefined) {
        await d.grammarItems.delete(existingItem.id);
      }

      await d.grammarItems.add({
        packKey: key,
        position: seedItem.no,
        pattern: seedItem.pattern,
        romaji: seedItem.romaji ?? null,
        ref: seedItem.ref ?? null,
        refOriginalEn: seedItem.refOriginalEn ?? null,
        meaningsKo: seedItem.meaningsKo,
        category: seedItem.category,
        explanation: seedItem.explanation,
        formation: seedItem.formation ?? null,
        notes: seedItem.notes ?? null,
        applicableQuizTypes: seedItem.applicableQuizTypes,
        examples: seedItem.examples,
        quizzes: seedItem.quizzes,
        ruleFamily: seedItem.ruleFamily ?? null,
        isFoundation: seedItem.isFoundation ?? false,
        createdAt: new Date(),
      } as never);
      stats.items++;
      stats.examples += seedItem.examples.length;
      stats.quizzes += seedItem.quizzes.length;
    }
  });

  return { pack: resultPack, stats };
}
