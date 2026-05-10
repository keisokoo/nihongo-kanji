# 문법 시드 채우기 — AI 작업 지시서

이 문서는 `scripts/data/grammar-{n5,n4,n3,n2,n1}.json` 시드 파일을 채우는
AI 작업자(Claude / cowork agent / 본인) 를 위한 지시서입니다.

> **비용 메모**: API 호출은 사용하지 않습니다. 작업자(AI) 가 batch JSON 을
> 작성하고, `_grammar_fill_merge.py` 가 atomic 으로 검증·머지합니다.

> **현재 상태**: jlptsensei.com 에서 N5~N1 패턴 목록을 크롤링하여
> `grammar-{level}.json` 빈 shell 이 만들어져 있습니다 (총 848개).
> 각 항목은 `pattern`, `romaji`, `ref`, `refOriginalEn` 만 채워져 있고
> 나머지는 비어있습니다. 이 문서는 그 빈 필드를 채우는 작업 가이드입니다.

---

## 0. 한자팩과의 차이

한자팩 (`AI_FILL_PROMPT.md`) 과 비슷한 워크플로지만 데이터 모양과 작성
대상이 다릅니다.

| | 한자팩 | 문법팩 |
|---|---|---|
| 시드 파일 | `n5.json` ~ `n1.json` | `grammar-n5.json` ~ `grammar-n1.json` |
| 항목 단위 | 한자 1글자 | 문법 패턴 1개 (예: `〜たい`) |
| 채울 것 | 단어 + 예문 | 설명 + 활용 + 예문 + 퀴즈 (5종 중 다수) |
| 머지 도구 | `_ai_fill_merge.py` | `_grammar_fill_merge.py` |
| Batch 키 | `character` | `pattern` (Japanese form) |

---

## 1. 데이터 구조

### 시드 파일 (canonical, 작업자가 직접 편집 X)

```jsonc
{
  "key": "N5-grammar",
  "title": "N5 문법",
  "kind": "jlpt-grammar",
  "level": "N5",
  "description": "JLPT N5 문법",
  "items": [
    {
      // 크롤러가 채워둔 (변경 X)
      "no": 1,
      "pattern": "ちゃいけない・じゃいけない",
      "romaji": "cha ikenai / ja ikenai",
      "ref": "https://jlptsensei.com/learn-japanese-grammar/...",
      "refOriginalEn": "must not do (spoken Japanese)",

      // ▼ 작업자가 채울 필드 ▼
      "meaningsKo": ["~하면 안 된다 (구어)"],
      "category": "expression",
      "explanation": "...",
      "formation": "동사 て형 + ちゃ + いけない",
      "notes": null,
      "applicableQuizTypes": ["form_meaning", "ko_to_jp_form"],
      "examples": [ /* { sentence, sentenceTranslationKo, note? } */ ],
      "quizzes":  [ /* { type, payload } */ ]
    }
  ]
}
```

### Batch 파일 (작업자가 작성)

```jsonc
// _grammar_fill_n5_p1.json (= phase 1)
{
  "_comment": "N5 grammar batch p1: 1~10",
  "fills": {
    "ちゃいけない・じゃいけない": { /* 위의 ▼ 항목들 */ },
    "だ / です":                  { /* ... */ },
    "だけ":                       { /* ... */ }
  }
}
```

키는 시드의 `pattern` 과 **정확히 일치** 해야 합니다 (한 글자라도 다르면 거부).

---

## 2. 필드별 규칙

### 2-1. `meaningsKo` (필수, 1~4개)

- 한국어만, 일본어/한자/영어/로마자 금지
- 빈도순. 가장 흔한 의미가 첫 번째
- 동사 활용형이면 `-다` 사전형으로 (`먹고 싶다`, `가고 싶다`)
- 조사면 짧은 한국어 대응 (`〜에서` → `~에서, ~로`)
- N1 후반의 어려운 패턴은 1~2개여도 OK

```
✅ ["~하고 싶다"]
✅ ["~만, ~뿐"]
✅ ["~에서, ~으로 (수단)"]
❌ ["want to ~"]              ← 영어
❌ ["〜だけ"]                  ← 일본어 그대로
```

### 2-2. `category` (필수, 8종 중 1)

| 값 | 대상 | 예 |
|---|---|---|
| `verb_form` | 동사 활용형 그 자체 | 〜ます, 〜て, 〜ない, 〜た |
| `particle` | 조사 | は, が, を, に, で |
| `expression` | 활용 + 의미가 결합된 표현 | 〜たい, 〜ている, 〜てもいい |
| `conjunction` | 접속 표현 | から, ので, けど, が |
| `auxiliary` | 조동사 / 단정 | だ, です, でしょう |
| `honorific` | 경어 / 정중표현 | お~になる, いらっしゃる |
| `ending` | 종조사 | よ, ね, か, わ |
| `other` | 위에 안 맞는 것 | 의문사, 지시어, 부사 등 |

판단 헷갈리면 `expression` (가장 광범위) 사용해도 무방.

### 2-3. `explanation` (필수, 한국어, 평문)

- 학습자가 처음 만났을 때 도움 되는 정도. **2~5 문장**
- 의미 + 언제 쓰는지 + (필요하면) 비슷한 표현과의 차이
- 줄바꿈 `\n` OK (단락 구분)
- 일본어 인용은 백틱 `\`` 으로 감싸기 (문서 가독성), 또는 그냥 평문 OK
- 한자/영어/로마자 본문 사용 X (인용 제외)

```
✅ "동작이나 상태를 강하게 부정하거나 금지할 때 쓰는 구어 표현. 「ちゃ」는
   「ては」, 「じゃ」는 「では」가 줄어든 것. 친구나 아랫사람에게만 사용."

❌ "negative expression that prohibits an action..."  ← 영어
```

### 2-4. `formation` (선택, 활용형 / 결합형이 있으면)

- 패턴이 어떻게 만들어지는지 한 줄로
- 한국어 + 일본어 (활용 라벨 사용 OK)
- 활용이 없는 조사/종조사면 `null`

```
✅ "동사 ます형 + たい"
✅ "동사 て형 + は (구어 ちゃ)"
✅ "い형용사 어간 + さ"
✅ null     ← 조사 〜は, 종조사 〜よ 등
```

### 2-5. `notes` (선택)

- 자주 틀리는 점, 구어/문어 차이, N5 학습자가 알면 좋은 주의사항
- 1~2문장. 없으면 `null`

### 2-6. `applicableQuizTypes` (필수, 1개 이상)

이 패턴에 어울리는 퀴즈 타입을 5종 중 골라 배열로. 항목 별로 의미가 통하는
타입만 선택. 필수 quiz 종류와 일치시켜야 함 (밑의 §2-8 참고).

| 타입 | 적용 적합 | 부적합 |
|---|---|---|
| `conjugation` | 활용이 있는 표현 (〜たい, 〜ます, 〜て) | 조사, 종조사 |
| `particle_blank` | 조사 (は/が/を/に/で…) | 활용 표현 |
| `pattern_blank` | 접속/표현 어구 (から/ので…) | 단순 조사 |
| `form_meaning` | 거의 모든 항목에서 사용 가능 | (생략) |
| `ko_to_jp_form` | 거의 모든 항목에서 사용 가능 | (생략) |

대부분의 항목은 **2~3 타입** 이 적용 가능.

### 2-7. `examples` (필수, 1~2개)

```jsonc
{
  "sentence": "{今日|きょう}は{{勉強したくない}}な。",
  "sentenceTranslationKo": "오늘은 공부하고 싶지 않아.",
  "note": null   // 선택
}
```

#### 마크업 (한자팩과 동일)

- `{{X}}` — **그 패턴이 사용된 부분**. 정확히 1번. 한자팩에서는 단어 자체였으나
  여기서는 문법 패턴의 활용 결과 (예: 〜たい → `{{したくない}}`)
- `{한자|히라가나}` — `{{}}` 밖의 모든 한자에 ruby 부착
- 평문 (히라가나/카타카나/조사/구두점) 그대로

#### ⚠ 핵심 제약: target `{{...}}` 안에 ruby 못 씀

parser 가 nested brace 를 처리하지 않으므로 `{{...}}` 내부에는 `{한자|reading}`
형식의 ruby 를 넣을 수 없음. `{{{撮|と}っちゃいけない}}` 같은 형태는 깨진 마크업.

→ target 안에 한자가 들어가야 한다면 두 가지 처리 방식:

**방식 A — target 분리 (권장)**: 한자는 ruby 와 함께 target 밖에 두고, 문법
어미만 target 으로 묶음. 학습자가 reading 을 볼 수 있어 UX 가 가장 좋음.

```
✅ "ここで{走|はし}{{っちゃいけない}}よ。"        ← target = "っちゃいけない"
✅ "{授業中|じゅぎょうちゅう}に{寝|ね}{{ちゃいけない}}。"  ← target = "ちゃいけない"
✅ "{学校|がっこう}に{行|い}き{{たい}}。"          ← target = "たい"
✅ "{学生|がくせい}{{です}}。"                     ← target = "です" (어미)
```

**방식 B — target 안의 한자는 ruby 없이 그대로**: target 형태가 의미상 한 단위로
보여야 할 때. 단점: 학습자가 한자 reading 을 모르면 발음 못 함. 익숙한 한자
(N5~N4 수준의 흔한 한자) 일 때만 사용.

```
✅ "{{勉強したくない}}な。"               ← 勉強 reading 없음 (N5에선 친숙)
❌ "{{走っちゃいけない}}よ。"            ← 走 reading 없음 → 학습자가 못 읽음
```

#### 그 외 잘못된 예

```
❌ "今日は{{勉強したくない}}な。"          ← 今日 ruby 누락
❌ "{今日|きょう}は勉強したくないな。"     ← target {{}} 누락
❌ "{{今日}}は{{勉強したくない}}な。"      ← target 2개
❌ "{{{撮|と}っちゃいけない}}"             ← target 안에 ruby (parser 깨짐)
```

#### 작성 원칙

1. **target {{...}} 정확히 1번**
2. **target 외 모든 한자에 ruby**
3. JLPT 레벨에 맞는 어휘. 자연스러운 일상 문장
4. 마침표 `。`, 쉼표 `、` (영문 punctuation 금지)
5. ruby reading 은 실제 발음 (연탁/촉음 반영)
6. 5~15 어절. 너무 길지 않게
7. 가능하면 그 패턴이 가장 자연스럽게 쓰이는 문맥

### 2-8. `quizzes` (필수, 1~4개, applicableQuizTypes 안에서)

`type` 별로 `payload` 모양이 다름. **각 quiz 의 `type` 은 반드시 그 항목의
`applicableQuizTypes` 안에 있어야 함**.

#### Type A — `conjugation` (활용 변형)

```jsonc
{
  "type": "conjugation",
  "payload": {
    "dictForm": "食べる",                   // 사전형
    "group": "ichidan",                     // godan|ichidan|irregular|i_adj|na_adj|noun|any
    "targetFormLabel": "ます형",
    "answer": "食べます",
    "distractors": ["食べります", "食べる", "食べました"],
    "hintKo": null                          // "동사 ます형은 어미를 い단으로" 같은 힌트
  }
}
```

규칙:
- `distractors` 정확히 **3개**
- `answer` 가 distractors 안에 들어가면 안 됨
- 그럴 듯한 오답 (흔한 활용 실수, 다른 활용형, 다른 시제 등)
- `group` = `any` 는 적용 동사가 다양한 패턴에서 사용 (drill 1개로 모든 활용 커버)

#### Type B — `particle_blank` / `pattern_blank` (빈칸 채우기)

```jsonc
{
  "type": "particle_blank",
  "payload": {
    "sentence": "{学校|がっこう}{{に}}行きます。",   // {{X}} = 빈칸 정답
    "answer": "に",
    "distractors": ["を", "で", "が"],
    "translationKo": "학교에 갑니다."
  }
}
```

규칙:
- `sentence` 의 `{{...}}` 안 텍스트 == `answer` (정확히 일치, 검증함)
- `{{}}` 외 모든 한자에 ruby
- `distractors` 3개, `answer` 와 중복 X
- `pattern_blank` 도 같은 모양 — 단순 조사가 아닌 더 긴 문법 어구일 때 사용

```jsonc
// pattern_blank 예시
{
  "type": "pattern_blank",
  "payload": {
    "sentence": "{雨|あめ}が{降|ふ}る{{ので}}{傘|かさ}を{持|も}って{行|い}きます。",
    "answer": "ので",
    "distractors": ["けど", "から", "のに"],
    "translationKo": "비가 오니까 우산을 가지고 갑니다."
  }
}
```

#### Type C — `form_meaning` (형태 → 의미 4지선다)

```jsonc
{
  "type": "form_meaning",
  "payload": {
    "prompt": "「食べたい」",
    "contextSentence": null,                 // 또는 마크업 문자열 (선택)
    "answer": "먹고 싶다",
    "distractors": ["먹은 적이 있다", "먹어 본다", "먹지 않다"]
  }
}
```

규칙:
- `prompt` 는 짧은 일본어 형태 (인용부호 권장: `「...」`)
- `contextSentence` 는 선택. 문맥이 없으면 의미가 갈리는 표현일 때 추가
- `distractors` 는 비슷한 일본어 표현의 한국어 의미 (학습자가 헷갈릴만한 것)
- `answer` 와 distractors 모두 한국어 (이 타입의 답안은 한국어)

#### Type D — `ko_to_jp_form` (한국어 → 올바른 일본어 형태)

```jsonc
{
  "type": "ko_to_jp_form",
  "payload": {
    "ko": "학교에 가고 싶어요.",
    "answer": "{学校|がっこう}に{行|い}き{{たい}}です。",
    "distractors": [
      "{学校|がっこう}を{行|い}き{{たい}}です。",       // を vs に (조사 오류)
      "{学校|がっこう}に{行|い}く{{たい}}です。",       // く vs き (활용 오류)
      "{学校|がっこう}に{行|い}き{{たかった}}です。"   // 시제 오류
    ],
    "hintKo": null
  }
}
```

규칙:
- 일본어 답안과 distractors 모두 ruby 마크업 적용 (`{한자|reading}`)
- **`{{}}` target 정확히 1개** — 그 패턴이 사용된 부분에 표시. UI 가 어디를 테스트하는지 시각적으로 강조
- 위의 §2-7 examples 와 동일한 마크업 룰 적용 (target 안에 ruby 못 씀, 한자 ruby 누락 금지 등)
- distractors 는 그 패턴을 잘못 적용한 자연스러운 오답 (조사 오류, 활용 오류, 시제 오류 등). 가능하면 정답과 비슷한 위치에 `{{}}` 마커
- `hintKo` 는 학습 포인트 짧게 (선택)

---

## 3. 작업 도구

### `_grammar_fill_merge.py`

```sh
python3 _grammar_fill_merge.py n5 _grammar_fill_n5_p1.json
# --overwrite 로 이미 채워진 항목 덮어쓰기 (기본은 skip)
```

#### 자동 검증 (실패 시 파일 변경 X)

- `pattern` 키가 시드에 존재
- `meaningsKo`: 1~4개, 한국어만 (일본어 char 검출)
- `category`: 8종 enum
- `explanation`: 비어있지 않음
- `applicableQuizTypes`: 비어있지 않음, 모두 5종 enum 안
- `examples`: 1개 이상, 마크업 룰 통과 (target 1개, brace 매칭)
- `quizzes`: 1개 이상
  - 모든 `type` 이 `applicableQuizTypes` 안
  - 각 payload 의 type 이 quiz.type 과 일치 (payload.type 필드는 선택, 있으면 일치 확인)
  - `distractors` 정확히 3개, `answer` 와 중복 X
  - `conjugation.group` 7종 enum
  - `particle_blank`/`pattern_blank` 의 sentence target 안 == answer
  - `form_meaning.prompt` / `contextSentence` 마크업 무결성 (target ≤ 1)
  - `form_meaning.answer` / `distractors` 는 plain 한국어 (마크업 금지)
  - `ko_to_jp_form.answer` / `distractors` 마크업 무결성 (target = 1, ruby 매칭)

---

## 4. 작업 절차

### 권장 batch 크기

- **10~15 항목 / sub-batch** 가 컨텍스트 안전 + 진척 체감 좋음
- 한자팩(17개) 보다 작은 이유: 항목당 분량이 더 큼 (설명 + 예문 + 퀴즈 다수)
- 각 sub-batch 마다 즉시 merge → 검증 → 다음
- 한 sub-batch 가 실패해도 이미 머지된 batch 는 영향 없음

### 레벨별 phase 가이드

| 레벨 | 항목수 | 권장 phase 분할 |
|---|---|---|
| N5 | 84  | 7 phase × 12 |
| N4 | 132 | 11 phase × 12 |
| N3 | 182 | 15 phase × 12 |
| N2 | 197 | 17 phase × 12 |
| N1 | 253 | 21 phase × 12 |

### 1 sub-batch 작성 흐름

1. 시드의 빈 항목 N개 추출 (pattern + romaji + refOriginalEn 만 보고 시작)
2. `ref` URL 의 jlptsensei 페이지를 참고할 수 있으면 참고 (의무 X)
3. § 2 의 모든 필드 채워서 batch JSON 작성 (`_grammar_fill_n5_p1.json` 등)
4. `python3 _grammar_fill_merge.py n5 _grammar_fill_n5_p1.json` 실행
5. 에러 메시지 보고 수정 → 재실행
6. `✅ N/N 항목 머지` 확인 → 다음 phase

### 일반 절차

1. **레벨 1개씩** (N5 → N4 → N3 → N2 → N1)
2. 한 phase 내에서도 sub-batch 단위로 머지·검증
3. 작업용 batch JSON 파일은 `_grammar_fill_*.json` 으로 명명 (gitignore 패턴)

---

## 5. 자주 발생하는 결함

| 결함 | 메시지 예 | 해결 |
|---|---|---|
| pattern 키 오타 | `"だけ ": seed 에 없음` (끝 공백) | 시드 pattern 그대로 복사 |
| meaningsKo 일본어 | `meaningsKo[0] "〜だけ" has Japanese chars` | 한국어로 |
| category 잘못 | `category "verb" not in {...}` | 8종 enum 중 선택 |
| applicableQuizTypes 비어있음 | `applicableQuizTypes must be non-empty` | 1개 이상 추가 |
| quiz type 매칭 안 됨 | `type "conjugation" not in item.applicableQuizTypes` | applicableQuizTypes 에 추가 또는 quiz 제거 |
| payload type 불일치 | `payload.type "X" != quiz.type "Y"` | 둘 다 같은 값으로 |
| target 0개 | `targets=0 (need 1)` | `{{...}}` 누락 |
| target 2개 | `targets=2` | 중복 `{{...}}` 제거 |
| brace 깨짐 | `malformed braces` | `{한자\|reading}` 매칭 확인. **`{{...}}` 안에 ruby 못 씀** — target 분리 (§2-7 방식 A) |
| distractor 갯수 | `distractors needs ≥3 items, got 2` | 정확히 3개 |
| answer 중복 | `answer "X" duplicates a distractor` | distractor 에서 그 항목 다른 걸로 |
| blank sentence ≠ answer | `sentence target "に" != answer "を"` | `{{}}` 안 텍스트와 answer 일치 |
| group enum | `group "godan-1" not in {...}` | godan/ichidan/irregular/i_adj/na_adj/noun/any |
| form_meaning answer 에 마크업 | `answer should be plain Korean (no markup)` | answer/distractors 는 한국어 평문만 |
| ko_to_jp_form target 누락 | `ko_to_jp_form.answer: targets=0 (need 1)` | answer/distractors 마다 `{{}}` 1개 |

---

## 6. 검증 (도구 우회한 수동 검사)

도구 거치지 않고 직접 시드를 편집했다면:

```sh
# JSON 문법 + 항목 카운트
python3 -c "
import json
LEVELS = ['n5','n4','n3','n2','n1']
for level in LEVELS:
    d = json.load(open(f'scripts/data/grammar-{level}.json'))
    items = d['items']
    filled = sum(1 for i in items if (i.get('explanation') or '').strip())
    print(f'  {level}: {filled}/{len(items)} 채워짐')
"
```

```sh
# parseSentence 로 모든 example/blank quiz 파싱
npx tsx --env-file=.env -e "
import { readFileSync } from 'fs';
import { parseSentence } from './app/lib/sentence';
const LEVELS = ['n5','n4','n3','n2','n1'];
let errs = 0;
for (const level of LEVELS) {
  const d = JSON.parse(readFileSync(\`scripts/data/grammar-\${level}.json\`, 'utf-8'));
  for (const it of d.items) {
    for (const ex of it.examples ?? []) {
      try { parseSentence(ex.sentence, \`\${level}/\${it.pattern}/example\`); }
      catch (e) { console.log(\`\${level}/\${it.pattern}: \${e.message}\`); errs++; }
    }
    for (const q of it.quizzes ?? []) {
      const s = q.payload?.sentence;
      if (typeof s === 'string') {
        try { parseSentence(s, \`\${level}/\${it.pattern}/quiz\`); }
        catch (e) { console.log(\`\${level}/\${it.pattern}: \${e.message}\`); errs++; }
      }
    }
  }
}
console.log(\`parse errors: \${errs}\`);
"
```

---

## 7. 빠른 시작 체크리스트

작업 시작 전:

- [ ] 어느 레벨에서 phase 몇 번을 작업할지 결정
- [ ] 시드 파일의 첫 빈 항목 (`explanation == ""`) 부터 N개 추출
- [ ] § 2-7, 2-8 의 마크업/payload 룰 다시 확인

각 sub-batch 후:

- [ ] `_grammar_fill_merge.py` 가 `✅ merged N item(s)` 로 끝남
- [ ] 검증 에러 0
- [ ] 시드 파일의 채워진 카운트가 +N 증가

전체 레벨 완료 후:

- [ ] 작업용 임시 batch JSON 정리 (`_grammar_fill_*.json`)
- [ ] 머지 도구 (`_grammar_fill_merge.py`) 는 유지
- [ ] (앱 통합 후) `npm run seed:sync` 실행

---

## 8. 작업자 참고 — 스타일 / 일관성

- 기존 시드 데이터 (특히 N5 가 채워지면) 의 톤·길이를 유지
- explanation 은 학습자가 한 번에 이해할 수 있는 분량 — 너무 길면 컨텍스트 압박
- examples 는 그 패턴이 가장 자연스럽게 쓰이는 문맥. 사전 예문 같은 느낌이면 OK
- distractors 는 진짜로 헷갈릴 만한 것 — 너무 동떨어진 오답은 학습 가치 X
- 의심스러운 활용/표기는 추가하지 말고 스킵 — 잘못된 데이터보다 빈 칸이 낫습니다
- N1 후반의 어려운 표현은 quiz 1개 (form_meaning) 만 있어도 OK

---

## 9. 참고 자료

- 원본 출처: 각 항목의 `ref` URL (jlptsensei.com)
- 한자팩 가이드: [`AI_FILL_PROMPT.md`](AI_FILL_PROMPT.md) — 마크업/검증 룰 동일
- TypeScript 도메인 타입: 추후 `app/lib/idb/grammar-types.ts` (앱 통합 시 추가됨, 현재 시점엔 본 문서가 정본)
