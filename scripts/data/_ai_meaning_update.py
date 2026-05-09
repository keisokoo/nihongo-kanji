#!/usr/bin/env python3
"""
_ai_meaning_update.py
한자의 meaningKo 필드만 일괄 업데이트.

Usage:
    python3 _ai_meaning_update.py <level> <fills_file>

fills_file format:
{
  "_comment": "...",
  "fills": {
    "一": "한 일 — 하나, 1",
    "七": "일곱 칠 — 일곱",
    ...
  }
}

검증:
- 키(한자)가 실제 데이터에 존재하는지
- 새 값이 em-dash(—) 형식인지 (한자뜻 — 부가설명)
- 새 값에 따옴표/period 없는지
"""

import json
import sys
import re

def validate_meaning(character, meaning):
    errs = []
    if not meaning:
        errs.append(f'{character}: empty meaning')
        return errs
    # em-dash 필수
    if '—' not in meaning:
        errs.append(f'{character}: missing em-dash (—) -> {meaning!r}')
    # 따옴표 금지 (큰따옴표, 한국식 따옴표)
    if '"' in meaning or '"' in meaning or '"' in meaning:
        errs.append(f'{character}: contains quotes -> {meaning!r}')
    # period 금지
    if '. ' in meaning or meaning.endswith('.') or '。' in meaning:
        errs.append(f'{character}: contains period -> {meaning!r}')
    return errs

def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    level = sys.argv[1]
    fills_file = sys.argv[2]

    target_path = f'{level}.json'
    with open(target_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    with open(fills_file, 'r', encoding='utf-8') as f:
        fills_data = json.load(f)
    fills = fills_data.get('fills', {})

    # 한자 인덱스 만들기
    by_char = {e['character']: e for e in data['kanji']}

    # 검증
    total_errs = 0
    for character, new_meaning in fills.items():
        if character not in by_char:
            print(f'❌ {character}: not found in {target_path}')
            total_errs += 1
            continue
        errs = validate_meaning(character, new_meaning)
        for e in errs:
            print(f'❌ {e}')
        total_errs += len(errs)

    if total_errs > 0:
        print(f'\n검증 실패: {total_errs} errors. 파일 수정 안함.')
        sys.exit(1)

    # 적용
    count = 0
    for character, new_meaning in fills.items():
        old = by_char[character].get('meaningKo', '')
        if old != new_meaning:
            by_char[character]['meaningKo'] = new_meaning
            count += 1

    with open(target_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'✅ updated {count} item(s) in {target_path}')

if __name__ == '__main__':
    main()
