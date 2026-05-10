"""Quiz 의 일본어 필드에 ruby 마크업 일괄 적용.

알고리즘:
1. ruby 마크업 (`{한자|읽기}`) 과 target 마크업 (`{{...}}`) 을 placeholder 로 보호
2. 보호된 string 에서 사전 lookup (longest match) 으로 한자 → ruby 치환
3. placeholder 복원

대상 필드: §1 quiz field 매핑 따름.
"""
import json
import re
from pathlib import Path

KANJI_RE = re.compile(r'[一-鿿]')
RUBY_RE = re.compile(r'\{[^|{}]+\|[^}]+\}')
TARGET_RE = re.compile(r'\{\{[^}]+\}\}')

JP_FIELDS = {
    "conjugation": ["dictForm", "answer"],
    "form_meaning": ["prompt", "contextSentence"],
    "ko_to_jp_form": ["answer"],
    "particle_blank": ["sentence"],
    "pattern_blank": ["sentence"],
}
JP_LIST_FIELDS = {
    "conjugation": ["distractors"],
    "ko_to_jp_form": ["distractors"],
}


def load_dict(path):
    with open(path, encoding="utf-8") as f:
        d = json.load(f)
    # _comment 제거
    d = {k: v for k, v in d.items() if not k.startswith("_")}
    # longest first 정렬 — substring conflict 방지
    items = sorted(d.items(), key=lambda kv: -len(kv[0]))
    return items


def protect_existing(text):
    """이미 ruby/target 마크업이 있는 부분을 \x00 placeholder 로 치환."""
    placeholders = []

    def replacer(m):
        placeholders.append(m.group(0))
        return f"\x00{len(placeholders) - 1}\x00"

    # target 먼저 (longer pattern)
    text = TARGET_RE.sub(replacer, text)
    text = RUBY_RE.sub(replacer, text)
    return text, placeholders


def restore_placeholders(text, placeholders):
    def replacer(m):
        idx = int(m.group(1))
        return placeholders[idx]
    return re.sub(r'\x00(\d+)\x00', replacer, text)


def apply_dict(text, dict_items):
    """Single-pass left-to-right scan with longest-match dictionary.
    Each ruby insertion is wrapped in a placeholder so it cannot be re-matched.
    """
    if not text or not KANJI_RE.search(text):
        return text
    protected, placeholders = protect_existing(text)
    # left-to-right scan
    out = []
    i = 0
    while i < len(protected):
        ch = protected[i]
        # placeholder marker (\x00<digits>\x00) — copy as-is
        if ch == "\x00":
            j = protected.index("\x00", i + 1) + 1
            out.append(protected[i:j])
            i = j
            continue
        # try dictionary longest match starting at i
        matched = False
        for src, dst in dict_items:  # already sorted longest-first
            if protected.startswith(src, i):
                # wrap dst as a new placeholder so future iterations don't touch it
                placeholders.append(dst)
                out.append(f"\x00{len(placeholders) - 1}\x00")
                i += len(src)
                matched = True
                break
        if not matched:
            out.append(ch)
            i += 1
    return restore_placeholders("".join(out), placeholders)


def find_unrubied_kanji(text):
    if not text:
        return []
    stripped = TARGET_RE.sub("", text)
    stripped = RUBY_RE.sub("", stripped)
    return KANJI_RE.findall(stripped)


def main():
    here = Path(__file__).parent
    dict_items = load_dict(here / "_ruby_dict.json")
    print(f"사전 로드: {len(dict_items)} entries")

    total_quizzes = 0
    total_changed = 0
    remaining_defects = []

    for level in ["n5", "n4", "n3", "n2", "n1"]:
        seed_path = here / f"grammar-{level}.json"
        with seed_path.open(encoding="utf-8") as f:
            d = json.load(f)

        level_changed = 0
        for it in d["items"]:
            for qidx, q in enumerate(it.get("quizzes", [])):
                total_quizzes += 1
                qt = q.get("type")
                payload = q.get("payload", {})
                # scalar fields
                for fld in JP_FIELDS.get(qt, []):
                    v = payload.get(fld)
                    if isinstance(v, str):
                        new_v = apply_dict(v, dict_items)
                        if new_v != v:
                            payload[fld] = new_v
                            level_changed += 1
                            total_changed += 1
                        # 잔존 한자 체크
                        miss = find_unrubied_kanji(payload[fld])
                        if miss:
                            remaining_defects.append({
                                "level": level, "no": it["no"],
                                "pattern": it["pattern"], "qidx": qidx,
                                "type": qt, "field": fld,
                                "value": payload[fld], "missing": "".join(miss),
                            })
                # list fields
                for fld in JP_LIST_FIELDS.get(qt, []):
                    lst = payload.get(fld) or []
                    new_list = []
                    for didx, v in enumerate(lst):
                        if isinstance(v, str):
                            nv = apply_dict(v, dict_items)
                            if nv != v:
                                level_changed += 1
                                total_changed += 1
                            new_list.append(nv)
                            miss = find_unrubied_kanji(nv)
                            if miss:
                                remaining_defects.append({
                                    "level": level, "no": it["no"],
                                    "pattern": it["pattern"], "qidx": qidx,
                                    "type": qt, "field": f"{fld}[{didx}]",
                                    "value": nv, "missing": "".join(miss),
                                })
                        else:
                            new_list.append(v)
                    payload[fld] = new_list

        with seed_path.open("w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print(f"  {level}: {level_changed} fields modified")

    print(f"\n총 변경: {total_changed} fields / {total_quizzes} quizzes")
    print(f"잔존 누락: {len(remaining_defects)}건")

    if remaining_defects:
        with (here / "_ruby_defects_remaining.json").open("w", encoding="utf-8") as f:
            json.dump(remaining_defects, f, ensure_ascii=False, indent=2)
        print(f"\n잔존 결함 저장: _ruby_defects_remaining.json")
        # show first 30
        for r in remaining_defects[:30]:
            print(f"  {r['level']}.{r['no']} {r['pattern']!r} q[{r['qidx']}].{r['type']}.{r['field']}")
            print(f"    missing: {r['missing']}, value: {r['value'][:80]}")


if __name__ == "__main__":
    main()
