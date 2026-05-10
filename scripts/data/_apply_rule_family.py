"""범용 ruleFamily 적용 스크립트 (v2: relatedFamilies + particle:basic-case 지원).
사용:
  python3 _apply_rule_family.py n5 --map mapping_n5.json
  python3 _apply_rule_family.py n5 --map mapping_n5.json --foundations adj:i,adj:na,copula

mapping JSON 값 형식:
  - null                                      → ruleFamily 제거
  - "verb:te"                                 → ruleFamily 단일 적용
  - {"primary": "verb:ta",
     "related": ["verb:dict","verb:nai"]}    → ruleFamily + relatedFamilies
  - {"primary": null}                         → ruleFamily + relatedFamilies 둘 다 제거
검증:
  - mapping 의 키 (no:int) 가 시드에 있는지
  - primary / related ID 가 정본 (CANONICAL) 에 있는지
적용:
  - foundations 인자에 명시된 ruleFamily 의 항목엔 isFoundation: true 자동 부여
"""
import argparse
import json
from pathlib import Path

CANONICAL = {
    "verb:masu", "verb:te", "verb:nai", "verb:ta", "verb:dict",
    "verb:ba", "verb:volitional", "verb:potential", "verb:passive",
    "verb:causative", "verb:causative-passive", "verb:imperative",
    "adj:i", "adj:na",
    "copula",
    "particle:basic-case",
    "particle:topic-subject", "particle:limit", "particle:example",
    "particle:comparison", "particle:scope",
    "conjunction:reason", "conjunction:contrast", "conjunction:listing",
    "conditional", "guess",
    "honorific:respect", "honorific:humble", "honorific:polite",
    "ending:question", "ending:emphasis", "ending:emotion",
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("level", choices=["n5", "n4", "n3", "n2", "n1"])
    ap.add_argument("--map", required=True, help="mapping JSON: {no: ruleFamily | null}")
    ap.add_argument("--foundations", default="", help="comma-sep ruleFamily IDs to mark isFoundation=true")
    args = ap.parse_args()

    seed_path = Path(__file__).parent / f"grammar-{args.level}.json"
    map_path = Path(__file__).parent / args.map
    foundations = set(s.strip() for s in args.foundations.split(",") if s.strip())

    with seed_path.open(encoding="utf-8") as f:
        d = json.load(f)
    with map_path.open(encoding="utf-8") as f:
        mp_raw = json.load(f)
    # int keys (skip _comment etc.)
    mp = {int(k): v for k, v in mp_raw.items() if not k.startswith("_")}

    def parse_entry(v):
        """값을 (primary, related) 튜플로 정규화.
        v 형태:
          - None                              → (None, [])
          - "verb:te"                         → ("verb:te", [])
          - {"primary": "x", "related": [..]} → ("x", [..])
          - {"primary": null}                 → (None, [])
        """
        if v is None:
            return None, []
        if isinstance(v, str):
            return v, []
        if isinstance(v, dict):
            return v.get("primary"), list(v.get("related") or [])
        raise ValueError(f"unsupported mapping value: {v!r}")

    # Validate
    errors = []
    seed_nos = {it["no"] for it in d["items"]}
    for k in mp:
        if k not in seed_nos:
            errors.append(f"map key no.{k} 가 시드에 없음")
    for k, v in mp.items():
        try:
            primary, related = parse_entry(v)
        except ValueError as e:
            errors.append(f"map[{k}]: {e}")
            continue
        if primary is not None and primary not in CANONICAL:
            errors.append(f"map[{k}].primary = {primary!r} (정본 ID 아님)")
        for r in related:
            if r not in CANONICAL:
                errors.append(f"map[{k}].related has {r!r} (정본 ID 아님)")
            if r == primary:
                errors.append(f"map[{k}]: related 가 primary 와 중복 ({r!r})")
    for f_id in foundations:
        if f_id not in CANONICAL:
            errors.append(f"foundation id {f_id!r} (정본 ID 아님)")
    if errors:
        for e in errors:
            print(f"❌ {e}")
        print(f"\n검증 실패: {len(errors)} errors. 파일 수정 안함.")
        return

    # Apply
    applied = 0
    cleared = 0
    related_set = 0
    fnd_set = 0
    for it in d["items"]:
        if it["no"] not in mp:
            continue
        primary, related = parse_entry(mp[it["no"]])
        if primary is None:
            if "ruleFamily" in it:
                del it["ruleFamily"]
                cleared += 1
            if "relatedFamilies" in it:
                del it["relatedFamilies"]
        else:
            old = it.get("ruleFamily")
            it["ruleFamily"] = primary
            if old != primary:
                applied += 1
            if related:
                old_rel = it.get("relatedFamilies") or []
                if list(old_rel) != related:
                    related_set += 1
                it["relatedFamilies"] = related
            else:
                if "relatedFamilies" in it:
                    del it["relatedFamilies"]
            if primary in foundations and not it.get("isFoundation"):
                it["isFoundation"] = True
                fnd_set += 1

    with seed_path.open("w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"✅ {args.level}: applied={applied} cleared={cleared} related_set={related_set} foundations_set={fnd_set}")


if __name__ == "__main__":
    main()
