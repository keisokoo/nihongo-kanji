#!/usr/bin/env python3
"""
AI fill 데이터를 시드 JSON에 머지하는 스크립트.

usage:
    python3 _ai_fill_merge.py n4 _ai_fill_n4_batch1.json [--mode words|examples]

modes:
    words    : 빈 한자에 단어를 추가 (기본). fills의 키는 character.
    examples : 기존 단어에 examples를 추가. fills의 키는 "character/word[#wordReading]".
    replace  : 기존 단어를 교체 (또는 삭제). fills의 키는 "character/oldWord[#oldWordReading]".
               value가 객체면 그 단어로 교체, value가 null이면 삭제.

검증을 통과하지 못하면 파일을 수정하지 않습니다.
"""
import json, re, sys, os
from pathlib import Path

DATA_DIR = Path(__file__).parent

def validate_word(character, w, valid_readings):
    errs = []
    if w['readingRef'] not in valid_readings:
        errs.append(f'readingRef "{w["readingRef"]}" not in {valid_readings}')
    if character not in w['word']:
        errs.append(f'word "{w["word"]}" missing focus kanji "{character}"')
    for m in w.get('meaningsKo', []):
        if re.search(r'[぀-ヿ一-鿿]', m):
            errs.append(f'meaningsKo "{m}" has Japanese')
    for ex in w.get('examples', []):
        errs.extend(validate_example(character, ex))
    return errs

def validate_example(character, ex):
    errs = []
    s = ex.get('sentence', '')
    tgt = re.findall(r'\{\{[^}]+\}\}', s)
    if len(tgt) != 1:
        errs.append(f'example targets={len(tgt)} -> {s}')
    outside = re.sub(r'\{\{[^}]+\}\}', '', s)
    if character in outside:
        errs.append(f'focus {character} outside target -> {s}')
    stripped = re.sub(r'\{\{[^}]+\}\}|\{[^|}]+\|[^|}]+\}', '', s)
    if '{' in stripped or '}' in stripped:
        errs.append(f'malformed braces -> {s}')
    return errs

def main():
    args = sys.argv[1:]
    mode = 'words'
    if '--mode' in args:
        i = args.index('--mode')
        mode = args[i+1]
        args = args[:i] + args[i+2:]
    if len(args) < 2:
        print(__doc__)
        sys.exit(1)
    level = args[0]
    fill_file = args[1]

    seed_path = DATA_DIR / f'{level}.json'
    fill_path = DATA_DIR / fill_file

    seed = json.loads(seed_path.read_text(encoding='utf-8'))
    fill = json.loads(fill_path.read_text(encoding='utf-8'))
    fills = fill.get('fills', {})

    # Index kanji and words
    kanji_by_char = {k['character']: k for k in seed['kanji']}

    # Validate
    total_errs = 0
    if mode == 'words':
        for character, words in fills.items():
            k = kanji_by_char.get(character)
            if k is None:
                print(f'❌ {character}: not in seed')
                total_errs += 1
                continue
            valid_readings = {r['reading'] for r in k.get('readings', [])}
            for w in words:
                errs = validate_word(character, w, valid_readings)
                for e in errs:
                    print(f'❌ {character}/{w.get("word","?")}: {e}')
                    total_errs += 1
    elif mode == 'examples':
        for key, examples in fills.items():
            if '/' not in key:
                print(f'❌ {key}: examples mode key must be "character/word[#wordReading]"')
                total_errs += 1
                continue
            character, rest = key.split('/', 1)
            # Optional disambiguator: word#wordReading
            if '#' in rest:
                word, want_reading = rest.split('#', 1)
            else:
                word, want_reading = rest, None
            k = kanji_by_char.get(character)
            if k is None:
                print(f'❌ {key}: kanji not in seed')
                total_errs += 1
                continue
            target_word = None
            for w in k.get('words', []):
                if w['word'] == word and (want_reading is None or w.get('wordReading') == want_reading):
                    target_word = w
                    break
            if target_word is None:
                print(f'❌ {key}: word not in kanji.words')
                total_errs += 1
                continue
            for ex in examples:
                errs = validate_example(character, ex)
                for e in errs:
                    print(f'❌ {key}: {e}')
                    total_errs += 1
    elif mode == 'replace':
        # value가 객체면 SeedWord, null이면 삭제
        for key, new_word in fills.items():
            if '/' not in key:
                print(f'❌ {key}: replace mode key must be "character/oldWord[#oldWordReading]"')
                total_errs += 1
                continue
            character, rest = key.split('/', 1)
            if '#' in rest:
                old_word, old_reading = rest.split('#', 1)
            else:
                old_word, old_reading = rest, None
            k = kanji_by_char.get(character)
            if k is None:
                print(f'❌ {key}: kanji not in seed')
                total_errs += 1
                continue
            target_idx = None
            for i, w in enumerate(k.get('words', [])):
                if w['word'] == old_word and (old_reading is None or w.get('wordReading') == old_reading):
                    target_idx = i
                    break
            if target_idx is None:
                print(f'❌ {key}: word not found in kanji.words')
                total_errs += 1
                continue
            # 삭제면 검증 불필요. 교체면 새 word 검증
            if new_word is not None:
                valid_readings = {r['reading'] for r in k.get('readings', [])}
                errs = validate_word(character, new_word, valid_readings)
                # 같은 word가 이미 다른 자리에 있으면 충돌
                for j, w in enumerate(k.get('words', [])):
                    if j == target_idx:
                        continue
                    if w['word'] == new_word['word'] and w.get('wordReading') == new_word.get('wordReading'):
                        errs.append(f'duplicates existing word "{new_word["word"]}" ({new_word.get("wordReading")})')
                for e in errs:
                    print(f'❌ {key} -> {new_word.get("word","?")}: {e}')
                    total_errs += 1
    else:
        print(f'unknown mode: {mode}')
        sys.exit(1)

    if total_errs > 0:
        print(f'\n검증 실패: {total_errs} errors. 파일 수정 안함.')
        sys.exit(1)

    # Merge
    merged = 0
    if mode == 'words':
        for character, words in fills.items():
            k = kanji_by_char[character]
            if k.get('words'):
                # 빈 한자만 처리한다는 가정. 비어있지 않으면 append (확장 시 사용)
                existing_words = {w['word'] for w in k['words']}
                for w in words:
                    if w['word'] not in existing_words:
                        k['words'].append(w)
                        merged += 1
            else:
                k['words'] = list(words)
                merged += len(words)
    elif mode == 'examples':
        for key, examples in fills.items():
            character, rest = key.split('/', 1)
            if '#' in rest:
                word, want_reading = rest.split('#', 1)
            else:
                word, want_reading = rest, None
            k = kanji_by_char[character]
            for w in k.get('words', []):
                if w['word'] == word and (want_reading is None or w.get('wordReading') == want_reading):
                    if 'examples' not in w or not w.get('examples'):
                        w['examples'] = list(examples)
                    else:
                        w['examples'].extend(examples)
                    merged += len(examples)
                    break
    elif mode == 'replace':
        for key, new_word in fills.items():
            character, rest = key.split('/', 1)
            if '#' in rest:
                old_word, old_reading = rest.split('#', 1)
            else:
                old_word, old_reading = rest, None
            k = kanji_by_char[character]
            for i, w in enumerate(k.get('words', [])):
                if w['word'] == old_word and (old_reading is None or w.get('wordReading') == old_reading):
                    if new_word is None:
                        # 삭제
                        del k['words'][i]
                        merged += 1
                    else:
                        k['words'][i] = new_word
                        merged += 1
                    break

    # Write back
    text = json.dumps(seed, ensure_ascii=False, indent=2)
    if not text.endswith('\n'):
        text += '\n'
    seed_path.write_text(text, encoding='utf-8')
    print(f'✅ merged {merged} item(s) into {seed_path.name}')

if __name__ == '__main__':
    main()
