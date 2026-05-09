# 시드 채우기 — AI 작업 지시서

이 문서는 `scripts/data/{n5,n4,n3,n2,n1}.json` 시드 파일의 데이터를 채우거나
보완하는 AI 작업자(Claude / cowork agent / 본인)를 위한 지시서입니다.

> **비용 메모**: 코드 내 API 호출(`scripts/translate-*.ts`)은 사용하지 마세요.
> 이 작업은 작업자(AI)가 JSON 파일을 직접 편집해서 끝냅니다.

> **현재 상태**: N5~N1 모든 한자(2,211개)에 단어와 예문이 채워져 있고,
> `meaningKo` 형식도 `한자뜻 — 부가설명`으로 통일되어 있습니다. 이 문서는
> **추후 보완/추가 작업**(새 단어 추가, 예문 보강, 결함 수정 등)을 위한
> 가이드입니다.

---

## 목표

각 시드 JSON 파일의 한자 항목에 대해, 누락 또는 결함을 다음 우선순위로 처리합니다.

1. `words` 가 비어 있으면 → JLPT 레벨에 맞는 **2–5개의 단어**를 추가
2. 각 단어에 `examples` 가 없으면 → **자연스러운 예문 1개**를 추가
3. 형식 결함(focus kanji 누락, ruby 누락 등)이 있으면 → 단어/예문 교체 또는 삭제
4. `meaningKo` 형식 불일치 → `한자뜻 — 부가설명` 형식으로 통일

> 한 단어당 예문은 1개로 시작하면 충분합니다. 여유가 있으면 2개까지 OK.

---

## 데이터 구조

```jsonc
{
  "key": "N5",
  "title": "N5",
  "kind": "jlpt",
  "description": "JLPT N5 한자",
  "kanji": [
    {
      "character": "一",
      "meaningKo": "한 일 — 하나, 1",  // 표준 형식: "한자뜻 — 부가설명"
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

## 1. `meaningKo` 형식 (한자 뜻)

**표준 형식**: `한자뜻 — 부가설명` (em-dash `—` 사용, en-dash나 hyphen 금지)

```
✅ "한 일 — 하나, 1"
✅ "嫁: 시집갈 가 — 장가가다, 시집가다"
✅ "兄: 형 형 — 맏형"

❌ "한 일"                              ← 부가설명 없음
❌ "“한 일”. 하나, 1"                   ← 따옴표+period 형식 (구버전)
❌ "한 일 - 하나"                       ← hyphen 사용 (em-dash 아님)
❌ "한 일. 하나, 1"                     ← period 사용
```

- 한자뜻은 한국 한자 사전의 표준 표기 (예: "갈 거", "마음 심")
- 부가설명은 `,`로 구분된 1~3개의 한국어 단어/짧은 구
- 일본어/한자/영어 금지

---

## 2. `words` 작성 규칙

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
  - N1: 상급 (학술, 전문 어휘, 인명용·벽자 포함)
- 한 한자당 **2–5 단어** (이미 데이터가 있어 추가가 적은 편)
- 음독 단어 + 훈독 단어 균형 있게
- 같은 한자가 다른 발음으로 쓰이는 경우 다양성 확보 (예: `一` → `一月(イチ)`, `一つ(ひとつ)`, `一人(ひとり)`)
- 일반 사전·교재에 등장하는 표준어. 비속어/희귀어 X
- **이미 있는 단어와 중복하지 말 것**
- N1 후반의 인명용/벽자(僻字)는 단어가 1–2개만 있어도 OK

### `readingRef` 매핑

- 단어 안에서 그 한자가 **실제로 어떻게 발음되는가**에 따라 결정
- 음독이면 카타카나 (`イチ`), 훈독이면 히라가나 (`ひと`, `ひとつ`)
- 부모 한자의 `readings[]` 에 그 reading 이 없다면 **그 단어를 쓰지 마세요**
- 같은 reading이 가타카나/히라가나로 둘 다 있을 수 있음 — 정확히 매칭

### `meaningsKo` 작성

- **한국어만**. 한자/일본어/영어/로마자 금지
  - 예: `"厄년"` ❌ → `"액운의 해"` ✅
- **빈도 순으로 1–3개**
- 동사: 사전형 `-다` (먹다, 가다)
- 형용사: `-다`/관형형 (크다, 큰)
- 숫자/날짜: 한국어 표기 (一月→["1월"], 三人→["세 명","3명"])
- 카운터: 단위 포함 (三本→["세 자루","3자루"])
- 고유명사: 음역 (富士山→["후지산"])

---

## 3. `examples` 작성 규칙 (인라인 마크업)

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
❌ "{学校|がっこう}で{{授業}}を…"      ← word 안의 다른 한자에 ruby 빠지면 안 됨
❌ "{お{{遊戯}}{会|かい}…"            ← 중첩된 brace (malformed)
```

### 예문 작성 원칙

1. **target 은 정확히 1번**, 반드시 `{{...}}` 로 감쌈
2. **target 외의 모든 한자에 ruby**. 누락 시 렌더가 깨짐
3. **focus 한자는 target 안에서만**. 본문 다른 곳에 등장하면 안 됨
   - focus = 그 단어가 속한 부모 한자 entry 의 `character`
   - 흔한 실수: 학교(校)의 예문에서 본문에 `学校` 사용 — `学校` 의 `校` 가 focus 밖에 있음
4. **JLPT 레벨**에 맞는 어휘/문법
   - N5: 단순한 평서문 (〜です/〜ます), 짧게
   - N4: 〜て형, 〜ない, 기본 조동사
   - N3+: 좀 더 다양한 표현
5. **마침표는 `。`**, 쉼표는 `、`. 영문 punctuation 금지
6. ruby 의 reading 은 그 문맥에서 실제로 발음되는 형태 (연탁/촉음 반영)
   - 예: `{学校|がっこう}` (○), `{学校|がくこう}` (×)
7. **자연스러운** 문장. 사전 예문 같은 느낌이면 OK
8. 한 단어당 예문 다양화 (subject/verb 패턴이 너무 비슷하지 않게)
9. brace는 반드시 매칭: `{한자|reading}` 한 단위로 닫혀야 함

### `sentenceTranslationKo` 작성

- 한국어로 자연스러운 의역 (직역 X)
- target 단어를 명시적으로 포함하지 않아도 됨 (예: 一月→"새해" 가능)

---

## 4. 작업 도구

`scripts/data/` 디렉토리에 두 가지 도구가 있습니다.

### 4-1. `_ai_fill_merge.py` — 단어/예문 batch 병합

작업 batch JSON을 만들어 일괄 병합. 검증 통과 못하면 파일 수정 안 함 (atomic).

**3가지 모드**:

```sh
python3 _ai_fill_merge.py <level> <batch_file> --mode <words|examples|replace>
```

#### 모드 1: `words` (빈 한자에 단어 추가)

```jsonc
// _ai_fill_n1_p1a.json
{
  "_comment": "...",
  "fills": {
    "嫡": [
      { "readingRef": "チャク", "word": "嫡子", "wordReading": "ちゃくし",
        "meaningsKo": ["적자", "정실 자식"], "examples": [] }
    ]
  }
}
```

#### 모드 2: `examples` (기존 단어에 예문 추가)

키 형식: `character/word` 또는 `character/word#wordReading` (동음이의 처리)

```jsonc
// _ai_fill_n1_ex_p1a.json
{
  "_comment": "...",
  "fills": {
    "哀/悲哀": [{
      "sentence": "{{悲哀}}に{満|み}ちた{物語|ものがたり}を{読|よ}んだ。",
      "sentenceTranslationKo": "비애에 가득 찬 이야기를 읽었다."
    }],
    "陵/陵#りょう": [{ "sentence": "...", "sentenceTranslationKo": "..." }],
    "陵/陵#みささぎ": [{ "sentence": "...", "sentenceTranslationKo": "..." }]
  }
}
```

#### 모드 3: `replace` (기존 단어 교체 또는 삭제)

```jsonc
{
  "_comment": "결함 수정",
  "fills": {
    "也/哉": null,                              // null = 삭제
    "也/也": {                                  // 객체 = 교체
      "readingRef": "ヤ", "word": "也", ...
    }
  }
}
```

### 4-2. `_ai_meaning_update.py` — meaningKo 형식 통일

```sh
python3 _ai_meaning_update.py <level> <fills_file>
```

```jsonc
// _ai_meaning_n5.json
{
  "_comment": "...",
  "fills": {
    "一": "한 일 — 하나, 1",
    "七": "일곱 칠 — 일곱, 7"
  }
}
```

### 도구의 자동 검증

검증 통과 못하면 파일을 수정하지 않습니다 (전부-아니면-전무):

- `readingRef` 가 부모 `readings[].reading` 에 존재
- `word` 안에 부모 `character` 포함
- `meaningsKo` 한국어만 (일본어 char 검출)
- `wordReading` 히라가나만
- 예문 target 정확히 1개 (`{{...}}`)
- focus 한자가 target 밖에 등장하지 않음
- brace 매칭 (`{`/`}` 균형, `{한자|reading}` 한 단위로 닫힘)
- `meaningKo` em-dash(—) 포함, 따옴표/period 없음

---

## 5. 작업 절차

### 권장 batch 크기 (실제 작업 경험 기반)

- **17 한자 / 1 sub-batch** 가 컨텍스트 안전 + 진척 체감 좋음
- **5 sub-batch = 1 Phase = 약 85 한자**
- 각 sub-batch 마다 즉시 merge → 검증 → 다음
- 한 sub-batch가 실패하면 그 batch만 수정 (나머지는 영향 없음)

### N1 작업 예시 (총 1,232 한자)

- 단어 작업: Phase 1 ~ 14 (마지막 Phase는 127 한자)
- 예문 작업: Phase 1 ~ 13 (마지막 Phase는 88 한자)

### 일반 절차

1. **레벨 1개씩** 작업하세요. (예: N5 → N4 → N3 → N2 → N1)
2. 빈 한자 17개를 추출 → batch JSON 작성 → merge → 검증
3. 작업 단위는 **한자 1개 ~ 17개** 묶음. 한 번에 너무 많이 시도하면 컨텍스트 폭발
4. 마지막에 빈 줄 1개 (Drizzle/포매터 관행)

---

## 6. 자주 발생하는 결함과 해결

| 결함 | 메시지 예 | 해결 |
| --- | --- | --- |
| readingRef 불일치 | `readingRef "ヒキ" not in {'ヒツ', 'ひき'}` | 가타카나/히라가나 매칭 확인 |
| focus kanji 누락 | `word "X" missing focus kanji "Y"` | 단어 교체 또는 삭제 |
| meaningsKo 일본어 | `meaningsKo "厄년" has Japanese` | 한국어로 다시 작성 |
| target 0개 | `targets=0` | `{{...}}` 누락 |
| target 2개 | `targets=2` | 중복 `{{...}}` 제거 |
| focus 본문 등장 | `focus 校 outside target` | 본문에서 그 한자를 다른 단어로 교체 |
| brace 깨짐 | `malformed braces` | `{한자\|reading}` 매칭 확인, 중첩 brace 금지 |
| em-dash 누락 | `missing em-dash (—)` | `—` (em-dash) 사용, hyphen `-` 금지 |

---

## 7. 검증 (도구 우회한 수동 검사)

도구를 거치지 않고 직접 JSON을 편집했다면 반드시 실행:

```sh
# 1. JSON 문법 + 구조 검증
python3 -c "
import json, re
LEVELS = ['n5','n4','n3','n2','n1']
total_errs = 0
for level in LEVELS:
    d = json.load(open(f'scripts/data/{level}.json'))
    for k in d['kanji']:
        # meaningKo 형식
        m = k.get('meaningKo', '')
        if m and '—' not in m:
            print(f'  {level}: {k[\"character\"]}: meaningKo missing em-dash'); total_errs += 1
        valid_readings = {r['reading'] for r in k.get('readings', [])}
        for w in k.get('words', []):
            # readingRef
            if w['readingRef'] not in valid_readings:
                print(f'  {level}: {k[\"character\"]}/{w[\"word\"]}: readingRef \"{w[\"readingRef\"]}\" not in readings'); total_errs += 1
            # word contains focus kanji
            if k['character'] not in w['word']:
                print(f'  {level}: {k[\"character\"]}/{w[\"word\"]}: word missing focus kanji'); total_errs += 1
            # meaningsKo Korean only
            for mk in w.get('meaningsKo', []):
                if re.search(r'[぀-ヿ一-鿿]', mk):
                    print(f'  {level}: {w[\"word\"]}: meaningsKo \"{mk}\" has Japanese'); total_errs += 1
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

## 8. 빠른 시작 체크리스트

작업 시작 전:

- [ ] 어느 레벨에서 무엇을 작업할지 결정 (단어 추가? 예문 추가? 결함 수정? meaningKo 통일?)
- [ ] 작업 batch 한자 갯수 결정 (17개가 안전)
- [ ] § 마크업 룰 ❌ 사례 다시 확인

각 batch 후:

- [ ] `_ai_fill_merge.py` 가 `✅ merged N item(s)` 로 끝나는지 확인
- [ ] 도구 우회한 경우 § 검증 의 1·2번 실행 → errors 0
- [ ] git diff 로 변경 내용 확인 (구조 깨짐 없음)

전체 완료 후:

- [ ] § 검증 의 3번 (시드 적용) 까지 실행
- [ ] 작업용 임시 batch JSON (`_ai_fill_*.json`, `_ai_meaning_*.json`) 정리
- [ ] 도구 스크립트(`_ai_fill_merge.py`, `_ai_meaning_update.py`) 는 유지
- [ ] 앱에서 한자 카드 + 한자 읽기 시험 둘 다 동작 확인

---

## 9. 작업자 참고 — 스타일/일관성

- 기존 시드 데이터(특히 N5)와 톤·길이를 유지
- 예문 길이: 5–15 어절 (너무 길지 않게)
- 같은 단어에 여러 예문이라면 서로 다른 문맥으로
- AI 의 "기본 충실" 모드로 충분. 화려한 표현 X
- 의심스러운 reading/표기는 추가하지 말고 스킵 — 잘못된 데이터보다 빈 칸이 낫습니다
- N1 후반의 인명용·벽자는 단어가 1–2개여도 OK (억지로 채우지 말 것)
- 검증 에러 발생 시 batch 전체가 거부됨. 한 줄만 수정하면 다시 통과
