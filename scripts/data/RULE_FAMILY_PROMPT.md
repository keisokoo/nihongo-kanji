# 룰 패밀리 metadata 채우기 — AI 작업 지시서

이 문서는 `scripts/data/grammar-{n5,n4,n3,n2,n1}.json` 시드 파일에 **룰 패밀리** 정보를 채우는 cowork 작업 가이드입니다.

> **선행**: [`GRAMMAR_FILL_PROMPT.md`](GRAMMAR_FILL_PROMPT.md) 가 끝나서 모든 항목이 기본 채워져 있는 상태에서 이 작업을 진행합니다.

---

## 0. 무엇을 하는가

각 `GrammarItem` 에 두 필드를 추가:

```jsonc
{
  "no": 5,
  "pattern": "で",
  ...
  "ruleFamily": "particle:limit",   // 새 필드
  "isFoundation": false              // 새 필드 (true / false / 생략)
}
```

- **`ruleFamily`** (선택): 같은 변형·사용 룰을 공유하는 family ID. 단독 항목은 `null` 또는 필드 생략.
- **`isFoundation`** (선택): family 의 기초 항목인지. true 인 항목은 family 페이지 헤드 카드 + 활용 가이드 풀 출력.

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
3. **둘 이상 패밀리에 걸칠 때**: 가장 핵심적인 룰 family 선택. 예:
   - 〜たがる: ます형 + たがる → `verb:masu`
   - 〜たことがある: た형 + ことがある → `verb:ta`
   - 〜ながら: ます형 어간 + ながら → `verb:masu`
4. **단독 항목** (룰 공유 없음, 부사·감탄·관용표현): `ruleFamily` 생략 또는 `null`
   - 예: あまり, やがて, さぞ, とりわけ, きっと 등 부사
   - 예: お互いに, わざと, めったに 등 단독 사용 표현

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

---

## 3. 작업 흐름

작업은 **N5 → N4 → N3 → N2 → N1** 순으로 진행. 각 레벨에 두 step:
A. 기초 항목 (foundation) 추가 (N5 만 해당 — 다른 레벨엔 추가 안 함)
B. 모든 derived 항목에 `ruleFamily` 채우기

### Step A: 기초 항목 추가 — **N5 만**

다음 기초 항목들이 어느 레벨 시드에도 없음. **N5 의 `items` 배열 앞부분에 insert** (다른 레벨엔 추가 X — JLPT 분류상 모두 N5 이전 단계 학습 내용):

| 추가할 패턴 | ruleFamily | category | 비고 |
|---|---|---|---|
| `ます (ます형)` | `verb:masu` | `verb_form` | foundation = true |
| `て (て형)` | `verb:te` | `verb_form` | foundation = true |
| `ない (ない형)` | `verb:nai` | `verb_form` | foundation = true |
| `た (た형)` | `verb:ta` | `verb_form` | foundation = true |
| `辞書形 (사전형)` | `verb:dict` | `verb_form` | foundation = true |

(필요시 〜ば 조건형 / 의지형도 추가 — 적절한 범위에서 판단)

기존 N5 의 1~84 position 을 shift 해서 1~5 (또는 6~10) 자리에 insert. 또는 0.1, 0.2 등 분수 사용 가능 (정렬용).

각 기초 항목의 `explanation` 은 짧게 (활용 가이드는 사용자가 🔧 버튼으로 AI 호출). 기존 1/2/3그룹 변형 룰 한두 줄 요약 정도.

`examples` / `quizzes` 1~2 개씩 (`GRAMMAR_FILL_PROMPT.md` 의 마크업 룰 따라).

i형용사 / な형용사 활용 / だ·です 는 이미 N5 에 항목으로 존재 → 그 항목들에 `isFoundation: true` + 적절한 `ruleFamily` 만 추가 (별도 추가 X).

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
