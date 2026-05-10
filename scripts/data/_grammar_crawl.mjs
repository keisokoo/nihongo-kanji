#!/usr/bin/env node
/**
 * Crawl JLPT grammar item lists from jlptsensei.com.
 *
 * 목적: pattern + 영어 의미 + 참조 URL 만 뽑아서 raw JSON 산출. 나머지
 * (한국어 설명 / formation / examples / quizzes) 는 _grammar_ai_fill.py 가
 * Claude 호출로 채움.
 *
 * Usage:
 *   node scripts/data/_grammar_crawl.mjs N5
 *   node scripts/data/_grammar_crawl.mjs N5 N4 N3 N2 N1
 *
 * 출력: scripts/data/grammar-{level}-raw.json
 *   [{ "no": 1, "romaji": "...", "pattern": "〜だ/です", "meaningEn": "...", "ref": "..." }, ...]
 */
import { writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const VALID = new Set(["N5", "N4", "N3", "N2", "N1"]);
const args = process.argv.slice(2).map((s) => s.toUpperCase());
const levels = args.filter((a) => VALID.has(a));
if (levels.length === 0) {
  console.error("usage: node _grammar_crawl.mjs N5 [N4 N3 N2 N1]");
  process.exit(1);
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

/** Extract page-number links from pagination block. Returns [1, 2, 3, ...]. */
function discoverPages(html) {
  const m = html.match(/<ul class=pagination>([\s\S]*?)<\/ul>/);
  if (!m) return [1];
  const nums = new Set([1]);
  for (const seg of m[1].matchAll(/page\/(\d+)\//g)) {
    nums.add(Number(seg[1]));
  }
  return [...nums].sort((a, b) => a - b);
}

/**
 * Parse rows from #jl-grammar table. Each row has:
 *   <td class="jl-td-num">N
 *   <td class="jl-td-gr"><a ...>romaji</a>
 *   <td class="jl-td-gj"><a class="jl-link jp" href="...">JP</a>
 *   <td class="jl-td-gm">meaning
 */
function parseRows(html) {
  const rows = [];
  const rowRe = /<tr class=jl-row>([\s\S]*?)(?=<tr class=jl-row>|<\/tbody>|<\/table>)/g;
  for (const rm of html.matchAll(rowRe)) {
    const cell = rm[1];
    const noM = cell.match(/jl-td-num[^>]*>(\d+)/);
    const grM = cell.match(/jl-td-gr[^>]*>(?:<a[^>]*>)?([^<]+)/);
    const gjA = cell.match(
      /jl-td-gj[^>]*>(?:<a[^>]*href=([^\s>]+)[^>]*>)?([^<]+)/,
    );
    const gmM = cell.match(/jl-td-gm[^>]*>([^<]+)/);
    if (!noM || !gjA) continue;
    rows.push({
      no: Number(noM[1]),
      romaji: grM?.[1].trim() ?? "",
      pattern: decode(gjA[2].trim()),
      meaningEn: gmM ? decode(gmM[1].trim()) : "",
      ref: gjA[1] ? gjA[1].replace(/^["']|["']$/g, "") : null,
    });
  }
  return rows;
}

function decode(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8217;/g, "’")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

async function crawlLevel(level) {
  const slug = level.toLowerCase();
  const base = `https://jlptsensei.com/jlpt-${slug}-grammar-list/`;
  console.log(`\n[${level}] ${base}`);

  const first = await fetchHtml(base);
  const pages = discoverPages(first);
  console.log(`  pages: ${pages.join(", ")}`);

  let all = parseRows(first);
  for (const p of pages.slice(1)) {
    const url = `${base}page/${p}/`;
    const html = await fetchHtml(url);
    const rows = parseRows(html);
    console.log(`  page ${p}: ${rows.length} rows`);
    all = all.concat(rows);
  }

  // Some entries on the site share the same `no` after re-numbering across
  // pages; dedupe by ref URL (most reliable identity).
  const seen = new Set();
  const out = [];
  for (const r of all) {
    const key = r.ref ?? `${r.no}|${r.pattern}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  out.sort((a, b) => a.no - b.no);

  const dest = resolve(HERE, `grammar-${slug}-raw.json`);
  await writeFile(dest, JSON.stringify(out, null, 2) + "\n", "utf-8");
  console.log(`  → ${out.length} items → ${dest}`);
  return out.length;
}

for (const level of levels) {
  await crawlLevel(level);
}
