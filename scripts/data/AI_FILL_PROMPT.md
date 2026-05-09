# 시드 채우기 — AI 작업 지시서

이 문서는 `scripts/data/{n5,n4,n3,n2,n1}.json` 시드 파일의 **빠진 `words`** 와
**빠진 `examples`** 를 채우는 AI 작업자(예: Claude / cowork agent / 본인)
를 위한 지시서입니다.

> **비용 메모**: 코드 내 API 호출(`scripts/translate-*.ts`)은 사용하지 마세요.
> 이 작업은 작업자(AI)가 JSON 파일을 직접 편집해서 끝냅니다.

---

## 목표

각 시드 JSON 파일의 한자 항목에 대해, 누락된 정보를 다음 우선순위로 채웁니다.

1. `words` 가 비어 있으면 → JLPT 레벨에 맞는 **5–8개의 단어**를 추가
2. 각 단어에 `examples` 가 없으면 → **자연스러운 예문 1개**를 추가

> 한 단어당 예문은 1개로 시작하면 충분합니다. 여유가 있으면 2개까지 OK.

---

## 현재 상태 (이 문서 작성 시점)

| Level | 한자 수 | words 빈 한자 | 단어 수 | examples 없는 단어 |
| ----- | ------: | ------------: | ------: | -----------------: |
| N5    |      79 |             0 |     440 |                439 |
| N4    |     166 |            24 |     693 |                693 |
| N3    |     367 |           339 |     128 |                128 |
| N2    |     367 |           358 |      31 |                 31 |
| N1    |   1,232 |         1,232 |       0 |                  0 |

> N5 의 1번째 한자(一)의 1번째 단어(一月) 에는 형식 참고용 예문이 들어가 있습니다.

---

## 파일 구조

```jsonc
{
  "key": "N5",
  "title": "N5",
  "kind": "jlpt",
  "description": "JLPT N5 한자",
  "kanji": [
    {
      "character": "一",
      "meaningKo": "“한 일”. 하나, 1",
      "strokeCount": 1,
      "readings": [
        { "type": "on",  "reading": "イチ" },
        { "type": "on",  "reading": "イツ" },
        { "type": "kun", "reading": "ひと" },
        { "type": "kun", "reading": "ひとつ" }
      ],
      "words": [
        {
          "readingRef": "イチ",        // ↓ 반드시 위 readings 중 하나와 일치
          "word": "一月",
          "wordReading": "いちがつ",
          "meaningsKo": ["1월"],
          "examples": [
            {
              "sentence": "{{一月}}に{雪|ゆき}が{降|ふ}ります。",
              "sentenceTranslationKo": "1월에 눈이 내립니다."
            }
          ]
        }
      ]
    }
  ]
}
```

---

## `words` 작성 규칙

```ts
type SeedWord = {
  readingRef: string;        // 부모 한자의 readings[].reading 중 하나와 정확히 일치
  word: string;              // 부모 한자(focus kanji)를 반드시 포함
  wordReading: string;       // 단어 전체의 히라가나 발음 (가타카나/한자 X)
  meaningsKo: string[];      // 1–3개의 짧은 한국어 뜻
  examples?: SeedExample[];  // 아래 규칙 참고
};
```

### 단어 선정 원칙

- **JLPT 레벨에 맞는 빈도/난이도** 의 일상 어휘 우선
  - N5: 가장 기초 (학교, 가족, 시간 등)
  - N4: 초급 (감정, 일상 활동)
  - N3: 중급 (사회, 추상 개념)
  - N2: 중상급 (뉴스, 직장)
  - N1: 상급 (학술, 전문 어휘)
- 한 한자당 **5–8 단어** 권장. 음독 단어 + 훈독 단어 균형 있게
- 같은 한자가 다른 발음으로 쓰이는 경우 다양성 확보 (예: `一` → `一月(イチ)`, `一つ(ひとつ)`, `一人(ひとり)`)
- 일반 사전·교재에 등장하는 표준어. 비속어/희귀어 X
- **이미 있는 단어와 중복하지 말 것**

### `readingRef` 매핑

- 단어 안에서 그 한자가 **실제로 어떻게 발음되는가**에 따라 결정
- 음독이면 카타카나 (`イチ`), 훈독이면 히라가나 (`ひと`, `ひとつ`)
- 부모 한자의 `readings[]` 에 그 reading 이 없다면 **그 단어를 쓰지 마세요**
  - (또는 흔한 경우엔 reading 을 추가하지 말고 reading 이 있는 단어로 대체)

### `meaningsKo` 작성

- **한국어만**. 한자/일본어/영어/로마자 금지
- **빈도 순으로 1–3개**
- 동사: 사전형 `-다` (먹다, 가다)
- 형용사: `-다`/관형형 (크다, 큰)
- 숫자/날짜: 한국어 표기 (一月→["1월"], 三人→["세 명","3명"])
- 카운터: 단위 포함 (三本→["세 자루","3자루"])
- 고유명사: 음역 (富士山→["후지산"])

---

## `examples` 작성 규칙 (인라인 마크업)

```ts
type SeedExample = {
  sentence: string;             // 인라인 마크업 (아래 룰)
  sentenceTranslationKo?: string;
};
```

### 마크업 룰

```
{{단어}}        → quiz target 단어. 정확히 1번. ruby 표시 X.
{한자|히라가나} → 다른 한자에는 모두 ruby 부착 (필수)
평문            → 히라가나/카타카나/조사/구두점은 그대로
```

### 예시

```
✅ "{{一月}}に{雪|ゆき}が{降|ふ}ります。"
✅ "{{学校}}で{日本語|にほんご}を{勉強|べんきょう}します。"
✅ "{{食べる}}のが{大好|だいす}きです。"

❌ "{{一月}}に雪が降ります。"          ← 雪/降 ruby 누락
❌ "一月に{雪|ゆき}が{降|ふ}ります。"  ← target {{}} 누락
❌ "{{一月}}は{一年|いちねん}で…"      ← focus 한자(一)가 target 밖에 등장
❌ "{{食べる}}{{のが}}…"               ← target 2개
```

### 예문 작성 원칙

1. **target 은 정확히 1번**, 반드시 `{{...}}` 로 감쌈
2. **target 외의 모든 한자에 ruby**. 누락 시 렌더가 깨짐
3. **focus 한자는 target 안에서만**. 본문 다른 곳에 등장하면 안 됨
   - focus = 그 단어가 속한 부모 한자 entry 의 `character`
4. **JLPT 레벨**에 맞는 어휘/문법
   - N5: 단순한 평서문 (〜です/〜ます), 짧게
   - N4: 〜て형, 〜ない, 기본 조동사
   - N3+: 좀 더 다양한 표현
5. **마침표는 `。`**, 쉼표는 `、`. 영문 punctuation 금지
6. ruby 의 reading 은 그 문맥에서 실제로 발음되는 형태 (연탁/촉음 반영)
   - 예: `{学校|がっこう}` (○), `{学校|がくこう}` (×)
7. **자연스러운** 문장. 사전 예문 같은 느낌이면 OK
8. 한 단어당 예문 다양화 (subject/verb 패턴이 너무 비슷하지 않게)

### `sentenceTranslationKo` 작성

- 한국어로 자연스러운 의역 (직역 X)
- target 단어를 명시적으로 포함하지 않아도 됨 (예: 一月→"새해" 가능)

---

## 작업 절차

1. **레벨 1개씩** 작업하세요. (예: N5 만 끝낸 뒤 N4)
2. 파일을 직접 Edit. 다음 사항을 동시에 검증:
   - JSON 문법 유효 (트레일링 콤마 X, 따옴표 일치)
   - 마지막에 빈 줄 1개 (Drizzle/포매터 관행)
   - `readingRef` 가 부모 `readings[].reading` 에 존재
   - 단어 안에 부모 `character` 포함
3. 작업 단위는 **한자 1개 ~ 10개** 묶음. 한 번에 너무 많이 시도하면 컨텍스트 폭발
4. 작업 후 검증 스크립트 실행 (아래 § 검증 참고)

### 권장 batch 크기

| Level | 권장 batch (한자 수) |
| ----- | -------------------- |
| N5    | 한 번에 끝 (79)      |
| N4    | 50씩 → 4 회          |
| N3    | 50씩 → 7-8 회        |
| N2    | 50씩 → 7-8 회        |
| N1    | 50씩 → 25 회         |

---

## 검증

작업 후 반드시 실행:

```sh
# 1. JSON 문법 + 구조 검증
python3 -c "
import json, re
LEVELS = ['n5','n4','n3','n2','n1']
total_errs = 0
for level in LEVELS:
    d = json.load(open(f'scripts/data/{level}.json'))
    for k in d['kanji']:
        valid_readings = {r['reading'] for r in k.get('readings', [])}
        for w in k.get('words', []):
            # readingRef
            if w['readingRef'] not in valid_readings:
                print(f'  {level}: {k[\"character\"]}/{w[\"word\"]}: readingRef \"{w[\"readingRef\"]}\" not in readings'); total_errs += 1
            # word contains focus kanji
            if k['character'] not in w['word']:
                print(f'  {level}: {k[\"character\"]}/{w[\"word\"]}: word missing focus kanji'); total_errs += 1
            # meaningsKo Korean only
            for m in w.get('meaningsKo', []):
                if re.search(r'[぀-ヿ一-鿿]', m):
                    print(f'  {level}: {w[\"word\"]}: meaningsKo \"{m}\" has Japanese'); total_errs += 1
            for ex in w.get('examples', []):
                s = ex.get('sentence','')
                # exactly one target
                tgt = re.findall(r'\{\{[^}]+\}\}', s)
                if len(tgt) != 1:
                    print(f'  {level}: {w[\"word\"]}: example targets={len(tgt)} (need 1)'); total_errs += 1
                # focus kanji only inside target
                outside = re.sub(r'\{\{[^}]+\}\}', '', s)
                if k['character'] in outside:
                    print(f'  {level}: {w[\"word\"]}: focus kanji {k[\"character\"]} outside target'); total_errs += 1
                # leftover braces
                stripped = re.sub(r'\{\{[^}]+\}\}|\{[^|}]+\|[^|}]+\}', '', s)
                if '{' in stripped or '}' in stripped:
                    print(f'  {level}: {w[\"word\"]}: malformed braces in sentence'); total_errs += 1
print(f'\\ntotal errors: {total_errs}')
"

# 2. parseSentence 로 모든 example 파싱
npx tsx --env-file=.env -e "
import { readFileSync } from 'fs';
import { parseSentence } from './app/lib/sentence';
const LEVELS = ['n5','n4','n3','n2','n1'];
let errs = 0;
for (const level of LEVELS) {
  const d = JSON.parse(readFileSync(\`scripts/data/\${level}.json\`, 'utf-8'));
  for (const k of d.kanji) {
    for (const w of k.words ?? []) {
      for (const ex of w.examples ?? []) {
        try {
          const tokens = parseSentence(ex.sentence, \`\${level}/\${k.character}/\${w.word}\`);
          const tg = tokens.filter((t) => t.target).length;
          if (tg !== 1) { console.log(\`\${level}/\${w.word}: targets=\${tg}\`); errs++; }
        } catch (e) { console.log(\`\${level}/\${w.word}:\`, e.message); errs++; }
      }
    }
  }
}
console.log(\`parse errors: \${errs}\`);
"

# 3. 통과하면 시드 적용
for L in n5 n4 n3 n2 n1; do
  npm run db:seed -- "scripts/data/$L.json"
done
```

---

## 빠른 시작 체크리스트

작업 시작 전:

- [ ] 어느 레벨부터 시작할지 결정 (n4 → n3 → n2 → n1 순 권장)
- [ ] 첫 batch 한자 갯수 결정 (10개 정도가 안전)
- [ ] 위 § 마크업 룰 ❌ 사례 다시 확인

각 batch 후:

- [ ] § 검증 의 1·2번 실행 → errors 0
- [ ] 변경 내용 git diff 로 확인 (구조 깨짐 없음)

전체 완료 후:

- [ ] § 검증 의 3번 (시드 적용) 까지 실행
- [ ] 앱에서 한자 카드 + 한자 읽기 시험 둘 다 동작 확인

---

## 작업자 참고 — 스타일/일관성

- 기존 시드 데이터(특히 N5)와 톤·길이를 유지
- 예문 길이: 5–15 어절 (너무 길지 않게)
- 같은 단어에 여러 예문이라면 서로 다른 문맥으로
- AI 의 "기본 충실" 모드로 충분. 화려한 표현 X
- 의심스러운 reading/표기는 추가하지 말고 스킵 — 잘못된 데이터보다 빈 칸이 낫습니다
