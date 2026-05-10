#!/usr/bin/env python3
"""
문법 시드 채우기 — batch JSON 검증 + 머지.

usage:
    python3 _grammar_fill_merge.py n5 _grammar_fill_n5_p1.json

batch JSON 형식:
    {
      "_comment": "...",
      "fills": {
        "<pattern>": { meaningsKo, category, explanation, formation, notes,
                       applicableQuizTypes, examples, quizzes },
        ...
      }
    }

key 는 grammar-{level}.json 의 items[].pattern 과 정확히 일치해야 함.

검증 통과 못하면 파일 수정 안 함 (atomic). 한 batch 안에 1건이라도 에러나면 전체 거부.

처음 채우는 (빈 explanation 인) 항목만 머지함. 이미 채워진 항목을 덮으려면
--overwrite 플래그.
"""
import json, re, sys
from pathlib import Path

DATA_DIR = Path(__file__).parent

CATEGORIES = {
    "verb_form", "particle", "expression", "conjunction",
    "auxiliary", "honorific", "ending", "other",
}
QUIZ_TYPES = {
    "conjugation", "particle_blank", "pattern_blank",
    "form_meaning", "ko_to_jp_form",
}
VERB_GROUPS = {
    "godan", "ichidan", "irregular",
    "i_adj", "na_adj", "noun", "any",
}

SENTENCE_TARGET_RE = re.compile(r"\{\{[^}]+\}\}")
RUBY_RE = re.compile(r"\{[^|}]+\|[^|}]+\}")


# ─── 문장 마크업 검증 ───────────────────────────────────────────────────────

def validate_sentence_markup(s, where, *, require_target=True):
    """
    parseSentence (app/lib/sentence.ts) 와 같은 룰로 검증.
    - {{X}} target 정확히 1개 (require_target=True 일 때)
    - {kanji|reading} ruby 매칭
    - leftover brace 없음
    """
    errs = []
    targets = SENTENCE_TARGET_RE.findall(s)
    if require_target and len(targets) != 1:
        errs.append(f'{where}: targets={len(targets)} (need 1) — "{s}"')
    elif not require_target and len(targets) > 1:
        errs.append(f'{where}: targets={len(targets)} (allow 0~1) — "{s}"')

    stripped = SENTENCE_TARGET_RE.sub("", s)
    stripped = RUBY_RE.sub("", stripped)
    if "{" in stripped or "}" in stripped:
        errs.append(f'{where}: malformed braces — "{s}"')
    return errs


def validate_string(v, name, where, *, allow_empty=False):
    if not isinstance(v, str):
        return [f'{where}: {name} must be string, got {type(v).__name__}']
    if not allow_empty and not v.strip():
        return [f'{where}: {name} is empty']
    return []


def validate_str_list(v, name, where, *, min_items=1, max_items=None, allow_empty_str=False):
    if not isinstance(v, list):
        return [f'{where}: {name} must be array']
    errs = []
    if len(v) < min_items:
        errs.append(f'{where}: {name} needs ≥{min_items} items, got {len(v)}')
    if max_items is not None and len(v) > max_items:
        errs.append(f'{where}: {name} allows ≤{max_items} items, got {len(v)}')
    for i, x in enumerate(v):
        if not isinstance(x, str):
            errs.append(f'{where}: {name}[{i}] must be string')
        elif not allow_empty_str and not x.strip():
            errs.append(f'{where}: {name}[{i}] empty')
    return errs


# ─── 항목별 검증 ────────────────────────────────────────────────────────────

def validate_example(ex, where):
    errs = []
    if not isinstance(ex, dict):
        return [f'{where}: example must be object']
    s = ex.get("sentence")
    if not isinstance(s, str) or not s.strip():
        errs.append(f'{where}: sentence missing or not string')
    else:
        errs.extend(validate_sentence_markup(s, f"{where}.sentence"))
    tr = ex.get("sentenceTranslationKo")
    if not isinstance(tr, str) or not tr.strip():
        errs.append(f'{where}: sentenceTranslationKo missing')
    note = ex.get("note", None)
    if note is not None and not isinstance(note, str):
        errs.append(f'{where}: note must be string or null')
    return errs


def validate_quiz(q, where, applicable):
    errs = []
    if not isinstance(q, dict):
        return [f'{where}: quiz must be object']
    qtype = q.get("type")
    if qtype not in QUIZ_TYPES:
        return [f'{where}: type "{qtype}" not in {sorted(QUIZ_TYPES)}']
    if qtype not in applicable:
        errs.append(f'{where}: type "{qtype}" not in item.applicableQuizTypes={applicable}')
    payload = q.get("payload")
    if not isinstance(payload, dict):
        return errs + [f'{where}: payload must be object']
    # payload 안에 type 필드가 있다면 quiz.type 과 일치해야 함 (TS discriminated
    # union 호환). 없으면 OK — quiz.type 만 있으면 충분.
    if "type" in payload and payload["type"] != qtype:
        errs.append(f'{where}: payload.type "{payload.get("type")}" != quiz.type "{qtype}"')

    if qtype == "conjugation":
        errs.extend(validate_string(payload.get("dictForm"), "dictForm", where))
        if payload.get("group") not in VERB_GROUPS:
            errs.append(f'{where}: group "{payload.get("group")}" not in {sorted(VERB_GROUPS)}')
        errs.extend(validate_string(payload.get("targetFormLabel"), "targetFormLabel", where))
        errs.extend(validate_string(payload.get("answer"), "answer", where))
        errs.extend(validate_str_list(payload.get("distractors"), "distractors", where, min_items=3, max_items=3))
        # answer must not be in distractors
        d = payload.get("distractors") or []
        if isinstance(d, list) and payload.get("answer") in d:
            errs.append(f'{where}: answer "{payload.get("answer")}" duplicates a distractor')
        hint = payload.get("hintKo", None)
        if hint is not None and not isinstance(hint, str):
            errs.append(f'{where}: hintKo must be string or null')

    elif qtype in ("particle_blank", "pattern_blank"):
        s = payload.get("sentence")
        errs.extend(validate_string(s, "sentence", where))
        if isinstance(s, str):
            # Sentence has exactly one {{...}} which holds the answer
            errs.extend(validate_sentence_markup(s, f"{where}.sentence", require_target=True))
            tgts = SENTENCE_TARGET_RE.findall(s)
            if len(tgts) == 1:
                inside = tgts[0][2:-2]  # strip {{ }}
                if inside != payload.get("answer"):
                    errs.append(f'{where}: sentence target "{inside}" != answer "{payload.get("answer")}"')
        errs.extend(validate_string(payload.get("answer"), "answer", where))
        errs.extend(validate_str_list(payload.get("distractors"), "distractors", where, min_items=3, max_items=3))
        d = payload.get("distractors") or []
        if isinstance(d, list) and payload.get("answer") in d:
            errs.append(f'{where}: answer duplicates a distractor')
        errs.extend(validate_string(payload.get("translationKo"), "translationKo", where))

    elif qtype == "form_meaning":
        prompt = payload.get("prompt")
        errs.extend(validate_string(prompt, "prompt", where))
        # prompt 도 ruby 를 포함할 수 있으므로 마크업 무결성 검증 (target ≤ 1)
        if isinstance(prompt, str):
            errs.extend(validate_sentence_markup(prompt, f"{where}.prompt", require_target=False))
        ctx = payload.get("contextSentence", None)
        if ctx is not None:
            if not isinstance(ctx, str):
                errs.append(f'{where}: contextSentence must be string or null')
            else:
                errs.extend(validate_sentence_markup(ctx, f"{where}.contextSentence", require_target=False))
        # answer/distractors 는 한국어 문자열 (마크업 없음). 잘못 ruby 가 들어가면 detect.
        ans = payload.get("answer")
        errs.extend(validate_string(ans, "answer", where))
        if isinstance(ans, str) and re.search(r'[{}]', ans):
            errs.append(f'{where}: answer should be plain Korean (no markup) — "{ans}"')
        errs.extend(validate_str_list(payload.get("distractors"), "distractors", where, min_items=3, max_items=3))
        d = payload.get("distractors") or []
        if isinstance(d, list):
            if ans in d:
                errs.append(f'{where}: answer duplicates a distractor')
            for i, x in enumerate(d):
                if isinstance(x, str) and re.search(r'[{}]', x):
                    errs.append(f'{where}: distractors[{i}] should be plain Korean (no markup) — "{x}"')

    elif qtype == "ko_to_jp_form":
        errs.extend(validate_string(payload.get("ko"), "ko", where))
        # answer 와 distractors 모두 일본어 문장 마크업. target {{...}} 정확히 1개.
        ans = payload.get("answer")
        errs.extend(validate_string(ans, "answer", where))
        if isinstance(ans, str):
            errs.extend(validate_sentence_markup(ans, f"{where}.answer", require_target=True))
        errs.extend(validate_str_list(payload.get("distractors"), "distractors", where, min_items=3, max_items=3))
        d = payload.get("distractors") or []
        if isinstance(d, list):
            if ans in d:
                errs.append(f'{where}: answer duplicates a distractor')
            for i, x in enumerate(d):
                if isinstance(x, str):
                    errs.extend(validate_sentence_markup(x, f"{where}.distractors[{i}]", require_target=True))
        hint = payload.get("hintKo", None)
        if hint is not None and not isinstance(hint, str):
            errs.append(f'{where}: hintKo must be string or null')

    return errs


def validate_fill(pattern, fill):
    where = f'fills["{pattern}"]'
    errs = []
    if not isinstance(fill, dict):
        return [f'{where}: must be object']

    errs.extend(validate_str_list(fill.get("meaningsKo"), "meaningsKo", where, min_items=1, max_items=4))
    # meaningsKo: 한국어만
    for i, m in enumerate(fill.get("meaningsKo") or []):
        if isinstance(m, str) and re.search(r'[぀-ヿ一-鿿]', m):
            errs.append(f'{where}: meaningsKo[{i}] "{m}" has Japanese chars')

    cat = fill.get("category")
    if cat not in CATEGORIES:
        errs.append(f'{where}: category "{cat}" not in {sorted(CATEGORIES)}')

    errs.extend(validate_string(fill.get("explanation"), "explanation", where))

    formation = fill.get("formation", None)
    if formation is not None and not isinstance(formation, str):
        errs.append(f'{where}: formation must be string or null')

    notes = fill.get("notes", None)
    if notes is not None and not isinstance(notes, str):
        errs.append(f'{where}: notes must be string or null')

    aqt = fill.get("applicableQuizTypes")
    if not isinstance(aqt, list) or not aqt:
        errs.append(f'{where}: applicableQuizTypes must be non-empty array')
        aqt = []
    else:
        for t in aqt:
            if t not in QUIZ_TYPES:
                errs.append(f'{where}: applicableQuizTypes contains "{t}" not in {sorted(QUIZ_TYPES)}')

    examples = fill.get("examples")
    if not isinstance(examples, list) or len(examples) < 1:
        errs.append(f'{where}: examples needs ≥1 item')
    else:
        for i, ex in enumerate(examples):
            errs.extend(validate_example(ex, f"{where}.examples[{i}]"))

    quizzes = fill.get("quizzes")
    if not isinstance(quizzes, list) or len(quizzes) < 1:
        errs.append(f'{where}: quizzes needs ≥1 item')
    else:
        for i, q in enumerate(quizzes):
            errs.extend(validate_quiz(q, f"{where}.quizzes[{i}]", set(aqt)))

    return errs


# ─── 메인 ────────────────────────────────────────────────────────────────────

def is_filled(item):
    return bool(
        (item.get("explanation") or "").strip()
        or item.get("examples")
        or item.get("quizzes")
    )


def main():
    args = sys.argv[1:]
    overwrite = False
    if "--overwrite" in args:
        args.remove("--overwrite")
        overwrite = True
    if len(args) < 2:
        print(__doc__)
        sys.exit(1)
    level = args[0].lower()
    fill_file = args[1]

    seed_path = DATA_DIR / f"grammar-{level}.json"
    fill_path = DATA_DIR / fill_file if not Path(fill_file).is_absolute() else Path(fill_file)

    if not seed_path.exists():
        print(f"❌ {seed_path} 없음 — _grammar_seed_init.mjs 먼저 실행")
        sys.exit(1)

    seed = json.loads(seed_path.read_text(encoding="utf-8"))
    fill = json.loads(fill_path.read_text(encoding="utf-8"))
    fills = fill.get("fills", {})

    items_by_pattern = {it["pattern"]: it for it in seed["items"]}

    # 1. 검증
    total_errs = 0
    for pattern, body in fills.items():
        if pattern not in items_by_pattern:
            print(f'❌ "{pattern}": seed 에 없음 (오타? 다른 레벨?)')
            total_errs += 1
            continue
        item = items_by_pattern[pattern]
        if is_filled(item) and not overwrite:
            print(f'⚠ "{pattern}": 이미 채워짐 — 건너뜀 (--overwrite 로 덮어쓰기)')
            continue
        errs = validate_fill(pattern, body)
        for e in errs:
            print(f"❌ {e}")
        total_errs += len(errs)

    if total_errs > 0:
        print(f"\n검증 실패: {total_errs} errors. 파일 수정 안함.")
        sys.exit(1)

    # 2. 머지
    merged = 0
    for pattern, body in fills.items():
        if pattern not in items_by_pattern:
            continue  # 이미 errs 처리됨
        item = items_by_pattern[pattern]
        if is_filled(item) and not overwrite:
            continue

        item["meaningsKo"] = list(body["meaningsKo"])
        item["category"] = body["category"]
        item["explanation"] = body["explanation"]
        item["formation"] = body.get("formation", None)
        item["notes"] = body.get("notes", None)
        item["applicableQuizTypes"] = list(body["applicableQuizTypes"])
        item["examples"] = list(body["examples"])
        item["quizzes"] = list(body["quizzes"])
        merged += 1

    text = json.dumps(seed, ensure_ascii=False, indent=2)
    if not text.endswith("\n"):
        text += "\n"
    seed_path.write_text(text, encoding="utf-8")
    print(f"✅ {merged}/{len(fills)} 항목 머지 → {seed_path.name}")


if __name__ == "__main__":
    main()
