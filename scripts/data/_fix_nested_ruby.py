"""Target {{...}} 안에 ruby `kanji|reading` 가 들어간 14건 fix.
정책: target 슬롯 안의 한자는 ruby 마크업 제거 (plain text). target 밖 부분은 그대로.
n1.238 처럼 target 이 너무 큰 경우는 target 자체를 좁히고 ruby 는 target 밖으로.
"""
import json
import re
from pathlib import Path

# 명시적 fix mapping — (level, no, qidx, field, before) -> after
FIXES = {
    # n3.13: 정답이 {{別に}} 이므로 distractor 도 ruby 빼고 target 만
    ('n3', 13, 2, 'distractors[0]'):
        ('{{特別|とくべつ}}{見|み}たい{映画|えいが}はありません。',
         '{{特別}}{見|み}たい{映画|えいが}はありません。'),
    ('n3', 13, 2, 'distractors[1]'):
        ('{{結局|けっきょく}}{見|み}たい{映画|えいが}はありません。',
         '{{結局}}{見|み}たい{映画|えいが}はありません。'),
    # n3.33: 정답 {{一体}} (한자, ruby 없음) → distractor 도 ruby 빼기
    ('n3', 33, 2, 'distractors[0]'):
        ('{{一度|いちど}}{何|なに}が{言|い}いたいんですか。',
         '{{一度}}{何|なに}が{言|い}いたいんですか。'),
    ('n3', 33, 2, 'distractors[1]'):
        ('{{一気|いっき}}{何|なに}が{言|い}いたいんですか。',
         '{{一気}}{何|なに}が{言|い}いたいんですか。'),
    ('n3', 33, 2, 'distractors[2]'):
        ('{{一方|いっぽう}}{何|なに}が{言|い}いたいんですか。',
         '{{一方}}{何|なに}が{言|い}いたいんですか。'),
    # n2.22
    ('n2', 22, 2, 'distractors[0]'):
        ('{{再度|さいど}}{日本|にほん}を{訪|おとず}れたいです。',
         '{{再度}}{日本|にほん}を{訪|おとず}れたいです。'),
    ('n2', 22, 2, 'distractors[1]'):
        ('{{もう一度|もういちど}}{日本|にほん}を{訪|おとず}れたいです。',
         '{{もう一度}}{日本|にほん}を{訪|おとず}れたいです。'),
    # n1.201: target 안 두 절 → target 좁히고 ruby 분리
    # 원본: {{デザインといい機能|きのうといい}}、{気|き}に{入|い}っています。
    # 의도: 'デザインといい機能といい' 가 정답 표현. ruby 는 機能|きのう 만.
    # 결과: {{デザインといい{機能|きのう}といい}} 도 nested 되니, target 안에는 plain.
    # 안전한 형태: {{デザインといい機能といい}} (한자 ruby 빼고 plain) — n1 학습자라 한자 OK 가정.
    ('n1', 201, 2, 'answer'):
        ('{{デザインといい機能|きのうといい}}、{気|き}に{入|い}っています。',
         '{{デザインといい機能といい}}、{気|き}に{入|い}っています。'),
    # n1.209
    ('n1', 209, 2, 'answer'):
        ('{{壁といわず天井|てんじょうといわず}}、カビが{生|は}えています。',
         '{{壁といわず天井といわず}}、カビが{生|は}えています。'),
    # n1.221
    ('n1', 221, 2, 'distractors[0]'):
        ('{{特別|とくべつ}}この{曲|きょく}が{気|き}に{入|い}っています。',
         '{{特別}}この{曲|きょく}が{気|き}に{入|い}っています。'),
    # n1.238 (わ〜わで): target 가 매우 크고 안에 ruby 4개 — target 을 패턴 부분만으로 좁힘
    # 원본: {{雨|あめは降|ふるわ、車|くるまは来|こないわで}}、{本当|ほんとう}にイライラします。
    # 의도: 'わ〜わで' 또는 'し〜し' 등이 정답 패턴. 문장 전체가 target 일 필요 X.
    # 가장 안전: ruby 살리고 target 은 패턴만. → {雨|あめ}は{降|ふ}る{{わ}}、{車|くるま}は{来|こ}ない{{わで}}、…
    ('n1', 238, 2, 'answer'):
        ('{{雨|あめは降|ふるわ、車|くるまは来|こないわで}}、{本当|ほんとう}にイライラします。',
         '{雨|あめ}は{降|ふ}る{{わ}}、{車|くるま}は{来|こ}ない{{わで}}、{本当|ほんとう}にイライラします。'),
    ('n1', 238, 2, 'distractors[0]'):
        ('{{雨|あめが降|ふるし車|くるまが来|こないし}}、{本当|ほんとう}にイライラします。',
         '{雨|あめ}が{降|ふ}る{{し}}、{車|くるま}が{来|こ}ない{{し}}、{本当|ほんとう}にイライラします。'),
    ('n1', 238, 2, 'distractors[1]'):
        ('{{雨|あめが降|ふるやら車|くるまが来|こないやら}}、{本当|ほんとう}にイライラします。',
         '{雨|あめ}が{降|ふ}る{{やら}}、{車|くるま}が{来|こ}ない{{やら}}、{本当|ほんとう}にイライラします。'),
    ('n1', 238, 2, 'distractors[2]'):
        ('{{雨|あめが降|ふるとか車|くるまが来|こないとか}}、{本当|ほんとう}にイライラします。',
         '{雨|あめ}が{降|ふ}る{{とか}}、{車|くるま}が{来|こ}ない{{とか}}、{本当|ほんとう}にイライラします。'),
}


def main():
    here = Path(__file__).parent
    applied = 0
    not_found = []
    for level in ['n5','n4','n3','n2','n1']:
        seed = here / f'grammar-{level}.json'
        with seed.open(encoding='utf-8') as f:
            d = json.load(f)
        changed = False
        for it in d['items']:
            for qidx, q in enumerate(it.get('quizzes', [])):
                payload = q.get('payload', {})
                # answer
                key = (level, it['no'], qidx, 'answer')
                if key in FIXES:
                    before, after = FIXES[key]
                    if payload.get('answer') == before:
                        payload['answer'] = after
                        applied += 1
                        changed = True
                    else:
                        not_found.append((key, payload.get('answer')))
                # distractors
                lst = payload.get('distractors') or []
                for didx, v in enumerate(lst):
                    key = (level, it['no'], qidx, f'distractors[{didx}]')
                    if key in FIXES:
                        before, after = FIXES[key]
                        if v == before:
                            lst[didx] = after
                            applied += 1
                            changed = True
                        else:
                            not_found.append((key, v))
        if changed:
            with seed.open('w', encoding='utf-8') as f:
                json.dump(d, f, ensure_ascii=False, indent=2)
                f.write('\n')
    print(f'✅ Applied: {applied} / {len(FIXES)}')
    if not_found:
        print(f'❌ Not found ({len(not_found)}):')
        for k, v in not_found:
            print(f'  {k}: actual={v!r}')


if __name__ == '__main__':
    main()
