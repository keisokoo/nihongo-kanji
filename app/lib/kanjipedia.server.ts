/**
 * Fetch on/kun readings from kanjipedia.jp.
 *
 * Flow:
 *   1. GET /search?k={kanji}&kt=1&sk=leftHand → search results page
 *   2. Find /kanji/{id} link in the result
 *   3. GET that detail page
 *   4. Parse the <ul id="onkunList"> block:
 *        <li><img alt="音"><p class="onkunYomi...">ブン・フン・ブ</p></li>
 *        <li><img alt="訓"><p class="onkunYomi...">わ<span class="txtNormal">ける</span>・…</p></li>
 *
 *   Readings are separated by `・`. For kun readings the okurigana is wrapped
 *   in <span class="txtNormal">; combining the bare stem + span text gives the
 *   full natural form (わ + ける = わける).
 */

const UA =
  "Mozilla/5.0 (compatible; nihongo-app/1.0; +https://github.com/keisokoo/nihongo)";

export type KanjiReadings = {
  on: string[];
  kun: string[];
  detailUrl: string;
};

export async function fetchKanjiReadings(
  kanjiChar: string,
): Promise<KanjiReadings> {
  if (!kanjiChar || [...kanjiChar].length !== 1) {
    throw new Error(`expected single kanji character, got: ${kanjiChar!}`);
  }

  const searchUrl = `https://www.kanjipedia.jp/search?k=${encodeURIComponent(kanjiChar)}&kt=1&sk=leftHand`;
  const searchHtml = await fetchHtml(searchUrl);

  const detailHref = searchHtml.match(/href="(\/kanji\/\d+)"/)?.[1];
  if (!detailHref) {
    throw new Error(`Kanjipedia: no detail link for ${kanjiChar}`);
  }
  const detailUrl = new URL(detailHref, "https://www.kanjipedia.jp").toString();
  const detailHtml = await fetchHtml(detailUrl);

  const { on, kun } = parseOnkunList(detailHtml);
  if (on.length === 0 && kun.length === 0) {
    throw new Error(`Kanjipedia: parsed 0 readings for ${kanjiChar}`);
  }

  return { on, kun, detailUrl };
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html" },
  });
  if (!res.ok) {
    throw new Error(`Kanjipedia fetch ${res.status} for ${url}`);
  }
  return res.text();
}

export function parseOnkunList(html: string): { on: string[]; kun: string[] } {
  const ul = html.match(/<ul id="onkunList">([\s\S]*?)<\/ul>/)?.[1];
  if (!ul) return { on: [], kun: [] };

  const on: string[] = [];
  const kun: string[] = [];

  const liRe = /<li>([\s\S]*?)<\/li>/g;
  let m: RegExpExecArray | null;
  while ((m = liRe.exec(ul))) {
    const li = m[1];
    const isOn = /alt=["']音["']/.test(li);
    const isKun = /alt=["']訓["']/.test(li);
    if (!isOn && !isKun) continue;

    const inner = li.match(/<p class="onkunYomi[^"]*">([\s\S]*?)<\/p>/)?.[1];
    if (!inner) continue;

    const readings = parseReadingsLine(inner);
    if (isOn) on.push(...readings);
    else kun.push(...readings);
  }

  return { on, kun };
}

/**
 * Parse the inner HTML of a single `<p class="onkunYomi">` line into readings.
 *
 * Separators between readings on the page take three forms:
 *   1. `・` (most common)
 *   2. `<span style="color:#000000">…</span>` wrapping a 外 (loanword) reading
 *      group — this is a separator boundary
 *   3. Plain whitespace between groups (after stripping decorative tags)
 *
 * Okurigana for kun-readings is wrapped in `<span class="txtNormal">…</span>`
 * and must be preserved as part of the reading text.
 */
function parseReadingsLine(inner: string): string[] {
  // 1. Replace okurigana spans with sentinel-wrapped, cleaned content so we
  //    can keep the okurigana text but drop any stray <img>/whitespace inside.
  let s = inner.replace(
    /<span class="txtNormal">([\s\S]*?)<\/span>/g,
    (_, body: string) => {
      const cleaned = body
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, "");
      return `⟨${cleaned}⟩`;
    },
  );

  // 2. Strip decorative markers and convert color-styled spans to a sentinel
  //    that will become a `・` separator after whitespace normalization.
  s = s
    .replace(/<sup[^>]*>[\s\S]*?<\/sup>/g, "")
    .replace(/<img[^>]*>/g, "")
    .replace(/<span\s+style="color:[^"]*">/g, "¦") // sentinel
    .replace(/<\/span>/g, "")
    .replace(/<[^>]+>/g, "");

  // 3. Decode common HTML entities.
  s = s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");

  // 4. Normalize all separators (sentinels + whitespace) to `・`, collapse runs.
  s = s
    .replace(/\s*¦\s*/g, "・")
    .replace(/\s+/g, "・")
    .replace(/・+/g, "・");

  // 5. Split, restore okurigana inside markers.
  return s
    .split("・")
    .map((part) => part.replace(/⟨([\s\S]*?)⟩/g, "$1").trim())
    .filter((part) => part.length > 0);
}
