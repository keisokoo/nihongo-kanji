# 룰 패밀리 metadata 채우기 — AI 작업 지시서

이 문서는 `scripts/data/grammar-{n5,n4,n3,n2,n1}.json` 시드 파일에 **룰 패밀리** 정보를 채우는 cowork 작업 가이드입니다.

> **선행**: [`GRAMMAR_FILL_PROMPT.md`](GRAMMAR_FILL_PROMPT.md) 가 끝나서 모든 항목이 기본 채워져 있는 상태에서 이 작업을 진행합니다.

---

## 0. 무엇을 하는가

각 `GrammarItem` 에 세 필드 (필요 시) 를 추가:

```jsonc
{
  "no": 5,
  "pattern": "で",
  ...
  "ruleFamily": "particle:limit",            // 주요 family — 그룹화·카운트의 기준
  "relatedFamilies": ["verb:ta", "verb:nai"], // 보조 (선택) — 다른 활용도 받을 때
  "isFoundation": false                       // family 의 기초 항목인지 (선택)
}
```

- **`ruleFamily`** (선택, 단일 string): 같은 변형·사용 룰을 공유하는 **주요** family ID. 단독은 `null` 또는 필드 생략.
- **`relatedFamilies`** (선택, string 배열): 패턴이 여러 활용 형태를 받을 때 **보조** family. primary 는 가장 흔한 사용으로, 나머지는 여기에. 패밀리 카드 카운트엔 영향 X.
- **`isFoundation`** (선택, boolean): family 의 기초 항목인지. true 인 항목은 family 페이지 헤드 카드 + 활용 가이드 풀 출력.

---

## 1. Family ID 목록 (정본)

`app/lib/grammar-families.ts` 의 `RULE_FAMILIES` 가 정본. **반드시 그 안의 ID 만 사용**. 새 ID 만들지 말 것.

### 동사 활용 (verb conjugation)

| ID | 의미 |
|---|---|
| `verb:masu` | ます형 (정중형). 〜たい, 〜ましょう, 〜ながら, 〜たがる 등 |
| `verb:te` | て형 (연결형). 〜ている, 〜てもいい, 〜てしまう, 〜てから 등 |
| `verb:nai` | ない형 (부정형). 〜ないでください, 〜なくてはならない 등 |
| `verb:ta` | た형 (과거형). 〜たことがある, 〜たばかり, 〜たら 등 |
| `verb:dict` | 사전형 (보통체 현재). 〜ことができる, 〜つもり, 〜ところだ 등 |
| `verb:ba` | 조건형 (~ば) |
| `verb:volitional` | 의지형 (~う/よう). 〜ようと思う, 〜ようとする 등 |
| `verb:potential` | 가능형 (~られる/~える) |
| `verb:passive` | 수동형 (受身形, ~られる) |
| `verb:causative` | 사역형 (使役形, ~せる/~させる) |
| `verb:causative-passive` | 사역수동 (~させられる) |
| `verb:imperative` | 명령·금지 (~ろ, ~なさい, ~るな) |

### 형용사

| ID | 의미 |
|---|---|
| `adj:i` | い형용사 활용 |
| `adj:na` | な형용사 활용 |

### 단정·정중

| ID | 의미 |
|---|---|
| `copula` | だ/です family (だ/だった/じゃない/じゃなかった ↔ です/でした/じゃありません) |

### 조사 family

| ID | 멤버 예 |
|---|---|
| `particle:basic-case` | の, を, に, へ, で, と, から (시작점) |
| `particle:topic-subject` | は, が |
| `particle:limit` | だけ, ばかり, しか, のみ, きり |
| `particle:example` | など, なんか, とか, やら |
| `particle:comparison` | より, ほど, くらい / ぐらい |
| `particle:scope` | まで, までに |

### 접속 family

| ID | 멤버 예 |
|---|---|
| `conjunction:reason` | から, ので, し, ため |
| `conjunction:contrast` | が, けど, のに, ても, しかし, でも |
| `conjunction:listing` | そして, それから, また, それに |

### 조건

| ID | 멤버 예 |
|---|---|
| `conditional` | ば, と, たら, なら |

### 추측·전문

| ID | 멤버 예 |
|---|---|
| `guess` | ようだ, そうだ (양태/전문 모두), らしい, だろう, でしょう, かもしれない, はず, みたい |

### 경어

| ID | 멤버 예 |
|---|---|
| `honorific:respect` | お~になる, いらっしゃる, なさる, おっしゃる, ご~なさる, 〜られる (존경 의미일 때만) |
| `honorific:humble` | お~する, いたす, 申す, 参る, 拝~ |
| `honorific:polite` | ございます, でございます |

### 종조사

| ID | 멤버 예 |
|---|---|
| `ending:question` | か, かい, かな, かしら |
| `ending:emphasis` | よ, ぞ, ぜ |
| `ending:emotion` | ね, なあ, わ |

---

## 2. 분류 규칙

### 어떤 family 에 들어가는지 판단

1. **변형 규칙을 공유**하는가? (verb 활용형, 형용사 활용)
   → 동사 변형이 ます형 어간에 의존 → `verb:masu`
   → 동사 변형이 て형에 의존 → `verb:te`
2. **같은 의미·문법 카테고리** 인가? (조사, 접속, 종조사, 추측 등)
3. **둘 이상 패밀리에 걸칠 때**: **primary 1개** 선택 (가장 흔한 사용 형태). 다른 형태도 받으면 `relatedFamilies` 배열에 추가.
   예시:
   - 〜たがる: ます형 + たがる → `ruleFamily: "verb:masu"`
   - 〜たことがある: た형 + ことがある → `ruleFamily: "verb:ta"`
   - 〜ながら: ます형 어간 + ながら → `ruleFamily: "verb:masu"`
   - **〜ほうがいい**: 가장 흔한 건 た형 권유 ("간 게 좋다"), 사전형/ない형도 받음
     → `ruleFamily: "verb:ta"`, `relatedFamilies: ["verb:dict", "verb:nai"]`
   - **〜んです / 〜のです**: 보통형 받음 (사전형 기반)
     → `ruleFamily: "verb:dict"`, `relatedFamilies: ["adj:i", "adj:na"]` (형용사 보통형도)
4. **단독 항목** (룰 공유 없음, 부사·감탄·관용표현): `ruleFamily` 생략 또는 `null`
   - 예: あまり, やがて, さぞ, とりわけ, きっと 등 부사
   - 예: お互いに, わざと, めったに 등 단독 사용 표현
   - 예: なる, になる, にする (단독 동사 표현)
5. **고정 표현** — 활용 규칙이 패턴 자체에 박혀있는 것: 보통 `null`
   - 예: があります / がいます (ある·いる 의 ます형 고정)

### `isFoundation` 판단

- family 의 **변형 규칙을 정의하는** 항목 1개만 true:
  - `verb:masu` → ます형 (그 자체) 항목 (현재 N5 에 없으니 cowork 가 추가)
  - `verb:te` → て형 항목 (추가 필요)
  - `adj:i` → "い형용사 활용" 항목 (이미 있음)
  - `adj:na` → "な형용사 활용" 항목 (이미 있음)
  - `copula` → だ/です 항목 (이미 있음)
- family 안에 명확한 foundation 이 없으면 모두 false 또는 생략
  - 예: `particle:limit` 의 だけ/ばかり/しか — 평등한 멤버, foundation 없음
  - 예: `conditional` 의 ば/と/たら/なら — 평등한 멤버
- 한 family 에 foundation 은 **최대 1개**
- **여러 후보가 있을 때 결정 원칙: "활용·변형의 출발점이 되는 가장 기본형"**
  - 긍정 > 부정: `だ/です` > `じゃない/ではない`
  - 현재 > 과거: `ます` > `ました`, `ません` > `ませんでした`
  - 사전형 > 활용형: `ない` > `なかった`, `た` > `たら`
  - 일반 > 정중: `だ` > `です` (단, copula family 의 경우 `だ/です` 가 보통 한 항목으로 묶여 있음)

---

## 3. 작업 흐름

작업은 **N5 → N4 → N3 → N2 → N1** 순으로 진행. 각 레벨에 두 step:
A. 기초 항목 (foundation) 추가 또는 기존 항목에 isFoundation 부여
B. 모든 derived 항목에 `ruleFamily` 채우기

### Step A: 기초 항목 (foundation) — 어느 레벨이든 가능

> **원칙**: foundation 은 family 의 변형 규칙을 정의하는 항목. 그 변형 규칙이 JLPT 어느 레벨에서 학습되는지에 따라 위치가 달라짐. **N5 에만 묶이지 않음.**

#### N5 에 추가할 기초 항목 (시드에 없음 → 새로 insert)

| 추가할 패턴 | ruleFamily | category | 비고 |
|---|---|---|---|
| `ます (ます형)` | `verb:masu` | `verb_form` | foundation = true |
| `て (て형)` | `verb:te` | `verb_form` | foundation = true |
| `ない (ない형)` | `verb:nai` | `verb_form` | foundation = true |
| `た (た형)` | `verb:ta` | `verb_form` | foundation = true |
| `辞書形 (사전형)` | `verb:dict` | `verb_form` | foundation = true |

#### 다른 레벨에 이미 존재하는 변형 규칙 자체 항목 — `isFoundation: true` 만 추가

JLPT 더 높은 레벨에서 학습되는 활용형은 그 레벨에 자체 항목으로 들어있음. 별도 항목 추가하지 말고 **기존 항목에 `isFoundation: true` + 알맞은 `ruleFamily` 만 set**:

| 레벨 | 패턴 | ruleFamily |
|---|---|---|
| N4 | 意向形 (의지형) | `verb:volitional` |
| N4 | 受身形 (수동형) | `verb:passive` |
| N4 | 使役形 (사역형) — 있으면 | `verb:causative` |
| N4 | 사역수동형 — 있으면 | `verb:causative-passive` |
| N4 | 명령·금지형 — 있으면 | `verb:imperative` |
| N4 | 가능형 — 있으면 (자체 항목 있을 때) | `verb:potential` |

cowork 가 각 레벨 작업하면서 위 후보 항목 발견하면 isFoundation 부여. 발견 못 하면 해당 family 는 foundation 없이 진행 (derived 항목들의 활용 가이드는 AI 가 자체 생성).

#### `verb:ba` 와 `conditional` 의 구분

- `conditional` family (ば·と·たら·なら) — **peer 비교** family. ば 는 이 안의 멤버 1 — peer 라 foundation 없음.
- `verb:ba` family — ば 형 자체에 무언가 더 붙는 derived 패턴 (〜ばよかった, 〜ば〜ほど 등) 이 있을 때 그 reference.

N5 의 `ば` 패턴은 `conditional` 로 분류 (ば/と/たら/なら 비교 학습이 N5-N4 핵심). `verb:ba` foundation 은 별도 추가 없이 두고, derived 항목들은 AI 자체 가이드.

기존 N5 의 1~84 position 을 shift 해서 1~5 (또는 6~10) 자리에 insert. 또는 0.1, 0.2 등 분수 사용 가능 (정렬용).

#### 🔍 Foundation `explanation` 작성 가이드 (중요)

Foundation 항목은 학습자가 **변형 규칙 reference 로 자주 펴보는** 곳이라 **일반 항목보다 풍부하게** 작성합니다. 다음 구조 권장 — 각 섹션 사이에 `\n\n` 으로 paragraph 띄우고, list 는 `\n- ` 또는 `\n• ` 사용.

UI 가 `whitespace-pre-line` 으로 렌더하므로 `\n` 그대로 줄바꿈, `\n\n` 은 paragraph 띄우기로 표시됨.

**구조 예** (ます형):

```jsonc
{
  "pattern": "ます (ます형)",
  "explanation": "동사를 정중하게 만드는 가장 기본 활용. 일상 회화·정중한 문장의 토대.\n\n【형성 규칙】\n• 1그룹 (5단): 어미 う단을 い단으로 바꾸고 ます — 行く → 行きます, 飲む → 飲みます\n• 2그룹 (1단): 어미 る를 빼고 ます — 食べる → 食べます, 見る → 見ます\n• 3그룹 (불규칙): する → します, 来る → 来ます (명사+する 도 같음: 勉強する → 勉強します)\n\n【예외 1그룹】 (2그룹처럼 보이는 1그룹 활용)\n• 帰る → 帰ります, 入る → 入ります, 切る → 切ります\n\n【파생 표현】 ます형 어간 (ます 빼기) 에 결합:\n• 〜ます / 〜ました / 〜ません / 〜ませんでした (시제·부정)\n• 〜たい (~하고 싶다), 〜たがる (3인칭 욕구)\n• 〜ながら (~하면서), 〜ましょう (~합시다)\n• 〜方 (~하는 방법)"
}
```

렌더 결과 (`whitespace-pre-line` 적용):

```
동사를 정중하게 만드는 가장 기본 활용. 일상 회화·정중한 문장의 토대.

【형성 규칙】
• 1그룹 (5단): 어미 う단을 い단으로 바꾸고 ます — 行く → 行きます, 飲む → 飲みます
• 2그룹 (1단): 어미 る를 빼고 ます — 食べる → 食べます, 見る → 見ます
• 3그룹 (불규칙): する → します, 来る → 来ます (명사+する 도 같음)

【예외 1그룹】 (2그룹처럼 보이는 1그룹 활용)
• 帰る → 帰ります, 入る → 入ります

【파생 표현】 ます형 어간에 결합:
• 〜ます / 〜ました / 〜ません / 〜ませんでした
• 〜たい, 〜たがる, 〜ながら, 〜ましょう, 〜方
...
```

**작성 가이드 요약**:
1. **첫 문단** (1-2문장): 한 줄로 정의 + 어떤 학습 단계에 위치하는지
2. **【형성 규칙】**: 1그룹 / 2그룹 / 3그룹 별 변형 룰 + 대표 동사 1-2개씩
3. **【예외】** (있으면): 헷갈리는 케이스
4. **【파생 표현】**: 이 foundation 위에 무엇이 쌓이는지 list (학습자 motivation)
5. 줄바꿈은 `\n` (단일) 또는 `\n\n` (paragraph). bullet 은 `\n• ` 또는 `\n- `
6. `examples` / `quizzes` 1~2 개씩 (`GRAMMAR_FILL_PROMPT.md` 의 마크업 룰 따라)

> **참고**: foundation 의 더 풍부한 sectioned 가이드는 사용자가 🔧 활용 가이드 버튼으로 AI 호출 → 별도 panel. `explanation` 은 정적 reference 라 cowork 가 직접 작성 (AI 호출 비용 X, 인쇄 가능, 한 화면에 표시됨).

기존 N5 의 foundation 이미 추가된 5개 (ます/て/ない/た/사전형) **+ 기존 isFoundation 처리된 3개** (い-adjectives / な-adjectives / だ・です) — 위 구조에 맞게 **explanation 보강** 필요.

i형용사 / な형용사 활용 / だ·です 는 이미 N5 에 항목으로 존재 → 그 항목들에 `isFoundation: true` + 적절한 `ruleFamily` 만 추가 (별도 추가 X). explanation 만 보강.

### Step B: 전 레벨 모든 derived 항목에 `ruleFamily` 채우기

각 항목을 보면서 §1 family ID 표에 따라 `ruleFamily` 필드 추가. 단독 항목은 생략 또는 `null`.

**작업 단위**: grammar-n5.json → grammar-n4.json → grammar-n3.json → grammar-n2.json → grammar-n1.json 순으로 진행.

**편집 방식**: 시드 JSON 파일을 **직접 편집**. 각 item 객체 안에 `ruleFamily` (필요 시 `isFoundation`) 필드만 추가. 다른 필드는 무손상.

```jsonc
// 예: grammar-n5.json
{
  "no": 3,
  "pattern": "だけ",
  ...,
  "applicableQuizTypes": [...],
  "examples": [...],
  "quizzes": [...],
  "ruleFamily": "particle:limit"  // ← 이 줄만 추가
}
```

```jsonc
// 단독 항목은 생략
{
  "no": 27,
  "pattern": "あまり〜ない",
  ...
  // ruleFamily 필드 자체를 안 적음
}
```

**foundation 표시** (N5 에만, 그리고 새로 추가한 5 + 이미 존재하는 3 항목):
```jsonc
{
  "pattern": "ます",
  "ruleFamily": "verb:masu",
  "isFoundation": true
}
```

**검증** — 작업 후 §5 검증 스니펫 실행. `RULE_FAMILIES` 에 없는 ID 가 사용되면 그 자리에서 에러 보임.

---

## 4. 권장 batch 크기 + 절차

- 한 batch: 30~50 항목 (metadata 만 채우는 작업이라 가벼움)
- 한 레벨 끝나면 §5 검증 → 다음 레벨
- N5 끝 → N4 → N3 → N2 → N1 순서

---

## 5. 검증 (수동)

ruleFamily ID 가 정본 list 에 있는지:

```sh
# 모든 grammar-n*.json 의 ruleFamily 값 추출 → grammar-families.ts 의 ID 와 대조
node -e "
const fs = require('fs');
const used = new Set();
['n5','n4','n3','n2','n1'].forEach(l => {
  const d = JSON.parse(fs.readFileSync(\`scripts/data/grammar-\${l}.json\`));
  d.items.forEach(i => { if (i.ruleFamily) used.add(i.ruleFamily); });
});
console.log([...used].sort());
"
```

위 결과가 `RULE_FAMILIES` 의 id 목록 안에 모두 있어야 함. 없는 게 있으면 오타.

---

## 6. 작업자 참고

- 분류가 모호하면 **단독 (null)** 처리. 잘못된 family 보다 비어있는 게 나음.
- Family 페이지에서 멤버 0 이면 home 에 안 보이니 잘못 분류해도 사용자에 노출 X.
- 기초 항목 (`isFoundation: true`) 는 family 당 **최대 1개**. 중복되면 첫 번째만 인정됨.
- ruleFamily 변경은 시드 다시 설치 시 자동 반영 (importGrammarPack 이 `seedItem.ruleFamily` 를 IDB row 로 복사).

---

## 7. 빠른 시작 체크리스트

작업 시작 전:
- [ ] `app/lib/grammar-families.ts` 의 ID 목록 확인
- [ ] §3 Step A 의 기초 항목 5개 추가 우선 (N5)

각 batch 후:
- [ ] §5 검증 통과 (모르는 family ID 없음)
- [ ] git diff 로 의도하지 않은 변경 없는지 확인

전체 완료 후:
- [ ] 메인 페이지의 "📚 룰 패밀리" 섹션에 family 카드들 보임
- [ ] 각 family 페이지 (`/family/:id`) 진입 시 멤버 list 정상
- [ ] foundation 항목의 활용 가이드 호출 시 그룹별 변형 규칙 풀 출력 / derived 항목 호출 시 "활용은 X형과 동일" 짧은 참조
