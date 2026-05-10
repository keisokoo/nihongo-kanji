import { db } from "./db";
import type { Favorite, FavoriteKind, Word, Kanji } from "./types";
import type { GrammarItem } from "./grammar-types";

export async function isFavorite(
  itemKind: FavoriteKind,
  itemId: number,
): Promise<boolean> {
  const d = db();
  const row = await d.favorites.get([itemKind, itemId]);
  return !!row;
}

export async function toggleFavorite(
  itemKind: FavoriteKind,
  itemId: number,
): Promise<boolean> {
  const d = db();
  const existing = await d.favorites.get([itemKind, itemId]);
  if (existing) {
    await d.favorites.delete([itemKind, itemId]);
    return false;
  }
  const row: Favorite = { itemKind, itemId, createdAt: new Date() };
  await d.favorites.put(row);
  return true;
}

export async function loadFavoriteIdsByKind(): Promise<{
  kanji: Set<number>;
  word: Set<number>;
  grammar: Set<number>;
}> {
  const d = db();
  const rows = await d.favorites.toArray();
  const out = {
    kanji: new Set<number>(),
    word: new Set<number>(),
    grammar: new Set<number>(),
  };
  for (const r of rows) {
    if (r.itemKind === "kanji") out.kanji.add(r.itemId);
    else if (r.itemKind === "word") out.word.add(r.itemId);
    else if (r.itemKind === "grammar") out.grammar.add(r.itemId);
  }
  return out;
}

export async function getFavoritesCount(): Promise<number> {
  const d = db();
  return d.favorites.count();
}

export type FavoriteKanjiView = {
  kind: "kanji";
  id: number;
  packKey: string;
  character: string;
  meaningKo: string;
  createdAt: Date;
};

export type FavoriteWordView = {
  kind: "word";
  id: number;
  packKey: string;
  kanjiId: number;
  kanjiCharacter: string;
  word: string;
  wordReading: string;
  meaningsKo: string[];
  createdAt: Date;
};

export type FavoriteGrammarView = {
  kind: "grammar";
  id: number;
  packKey: string;
  pattern: string;
  meaningsKo: string[];
  createdAt: Date;
};

export type FavoritesData = {
  total: number;
  kanji: FavoriteKanjiView[];
  word: FavoriteWordView[];
  grammar: FavoriteGrammarView[];
};

export async function loadFavoritesData(): Promise<FavoritesData> {
  const d = db();
  const rows = await d.favorites.orderBy("createdAt").reverse().toArray();
  const result: FavoritesData = {
    total: rows.length,
    kanji: [],
    word: [],
    grammar: [],
  };
  if (rows.length === 0) return result;

  // Bulk get for each kind
  const kanjiIds = rows
    .filter((r) => r.itemKind === "kanji")
    .map((r) => r.itemId);
  const wordIds = rows
    .filter((r) => r.itemKind === "word")
    .map((r) => r.itemId);
  const grammarIds = rows
    .filter((r) => r.itemKind === "grammar")
    .map((r) => r.itemId);

  const [kanjiRows, wordRows, grammarRows] = await Promise.all([
    kanjiIds.length > 0 ? d.kanji.bulkGet(kanjiIds) : Promise.resolve([]),
    wordIds.length > 0 ? d.words.bulkGet(wordIds) : Promise.resolve([]),
    grammarIds.length > 0
      ? d.grammarItems.bulkGet(grammarIds)
      : Promise.resolve([]),
  ]);

  const kanjiById = new Map<number, Kanji>();
  for (const k of kanjiRows) if (k) kanjiById.set(k.id, k);
  const wordById = new Map<number, Word>();
  for (const w of wordRows) if (w) wordById.set(w.id, w);
  const grammarById = new Map<number, GrammarItem>();
  for (const g of grammarRows) if (g) grammarById.set(g.id, g);

  // 단어용 부모 한자 lookup
  const parentKanjiIds = [
    ...new Set([...wordById.values()].map((w) => w.kanjiId)),
  ];
  const parentKanjiRows =
    parentKanjiIds.length > 0
      ? await d.kanji.bulkGet(parentKanjiIds)
      : [];
  const parentKanjiById = new Map<number, Kanji>();
  for (const k of parentKanjiRows) if (k) parentKanjiById.set(k.id, k);

  // createdAt 역순 그대로 — rows 가 이미 정렬되어 있음
  for (const r of rows) {
    if (r.itemKind === "kanji") {
      const k = kanjiById.get(r.itemId);
      if (!k) continue;
      result.kanji.push({
        kind: "kanji",
        id: k.id,
        packKey: k.packKey,
        character: k.character,
        meaningKo: k.meaningKo,
        createdAt: r.createdAt,
      });
    } else if (r.itemKind === "word") {
      const w = wordById.get(r.itemId);
      if (!w) continue;
      const parent = parentKanjiById.get(w.kanjiId);
      result.word.push({
        kind: "word",
        id: w.id,
        packKey: parent?.packKey ?? "",
        kanjiId: w.kanjiId,
        kanjiCharacter: parent?.character ?? "",
        word: w.word,
        wordReading: w.wordReading,
        meaningsKo: w.meaningsKo,
        createdAt: r.createdAt,
      });
    } else {
      const g = grammarById.get(r.itemId);
      if (!g) continue;
      result.grammar.push({
        kind: "grammar",
        id: g.id,
        packKey: g.packKey,
        pattern: g.pattern,
        meaningsKo: g.meaningsKo,
        createdAt: r.createdAt,
      });
    }
  }

  return result;
}
