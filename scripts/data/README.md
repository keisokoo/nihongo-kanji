# 한자 팩 (Pack) JSON 형식

이 폴더의 JSON 파일은 두 가지 경로로 사용됩니다:

1. **CLI 시드** (시스템에서 관리하는 JLPT 데이터)
   ```sh
   npm run db:seed scripts/data/n5.json
   ```
   `kind: "jlpt"` 또는 키가 `N1`~`N5` 인 경우, JLPT 레벨 자리에 적재됩니다.

2. **UI 임포트** (커스텀 팩)
   메인 페이지 우측 상단의 **`+ JSON 가져오기`** 버튼으로 업로드.
   `POST /api/pack/import` 엔드포인트가 이 파일을 받아 처리합니다.
   **제목/키가 `N1`~`N5` 인 파일은 거부됩니다** (시스템 예약).

---

## 최상위 구조

```jsonc
{
  "key": "tobira-ch1",          // (선택) URL/식별자. 빈 칸이면 title에서 자동 생성
  "title": "토비라 1과",         // (필수) 표시 이름
  "kind": "custom",             // (선택) "jlpt" | "custom" — 자동 추론
  "description": "토비라 교재 1과 한자",  // (선택)
  "kanji": [
    // 아래 "한자 항목" 형식
  ]
}
```

규칙:
- **JLPT 5단계 (`N1`~`N5`)** 는 시스템 예약입니다. CLI 시드만 사용하세요.
- **커스텀 팩**의 `key` / `title` 은 `N1`~`N5` (대소문자 무관) 가 될 수 없습니다.
- 같은 `key` 로 다시 import 하면 해당 팩의 한자가 **갈아끼워집니다** (팩 자체는 유지).

---

## 한자 항목

```jsonc
{
  "character": "学",                    // (필수) 한자 1글자
  "meaningKo": "배울 학 — 배우다, 학문",  // (필수) 한국어 의미
  "strokeCount": 8,                     // (선택) 획수
  "readings": [                         // (필수)
    { "type": "on",  "reading": "ガク" },
    { "type": "kun", "reading": "まなぶ" }
    // 여러 개 가능. on=음독(카타카나), kun=훈독(히라가나)
  ],
  "words": [                            // (선택)
    {
      "readingRef": "ガク",              // readings[].reading 중 하나와 일치
      "word": "学校",
      "wordReading": "がっこう",
      "examples": []                    // (선택, 비워둬도 됨)
    }
  ]
}
```

### `words[].readingRef`
이 단어가 한자의 어떤 읽기를 사용하는지 표시합니다.
- 예: `学校` 의 `学` 는 `ガク` (음독) → `readingRef: "ガク"`
- 예: `学ぶ` 의 `学` 는 `まなぶ` (훈독) → `readingRef: "まなぶ"`

값은 위 `readings` 배열의 `reading` 필드와 정확히 일치해야 합니다.

### `words[].examples` (선택)
초기 시드 예문. 비워두면 사용자가 학습할 때 Claude API 가 lazy 생성합니다.
**대부분의 경우 비워두는 것을 권장** — Haiku 가 자동으로 채웁니다.

예문을 직접 넣으려면:
```jsonc
{
  "examples": [
    {
      "sentence": "{{学校}}に{行|い}きます。",
      "sentenceTranslationKo": "학교에 갑니다."
    }
  ]
}
```

#### 문장 마크업 규칙
- `{{TARGET}}` — 퀴즈 정답이 될 단어 (정확히 1번 필수, ruby 표시 안 함)
- `{kanji|hiragana}` — target 외의 한자에 후리가나 ruby
- 일반 텍스트 (히라가나/가타카나/구두점) 는 그대로

예시 비교:

| 자연 일본어 | 마크업 |
|---|---|
| `学校に行きます。` | `{{学校}}に{行\|い}きます。` |
| `毎日学校に通っています。` | `{毎日\|まいにち}{{学校}}に{通\|かよ}っています。` |

---

## 최소 예시 (커스텀 팩)

```jsonc
{
  "title": "이번주 공부",
  "description": "회화 책 3과에서 만난 한자",
  "kanji": [
    {
      "character": "話",
      "meaningKo": "말씀 화 — 이야기하다",
      "strokeCount": 13,
      "readings": [
        { "type": "on",  "reading": "ワ" },
        { "type": "kun", "reading": "はなす" }
      ],
      "words": [
        { "readingRef": "ワ",     "word": "電話", "wordReading": "でんわ" },
        { "readingRef": "はなす", "word": "話す", "wordReading": "はなす" }
      ]
    }
  ]
}
```

import 후 `/study/이번주공부/...` 같은 URL 로 접근됩니다 (key 슬러그).

---

## 동작 시퀀스

1. **팩 생성/갱신**: `packs` 테이블에 row upsert
2. **한자 갱신**: 해당 팩 + character 의 기존 row를 삭제하고 새로 insert
3. **읽기/단어/예문**: 한자에 cascade 로 부착
4. **explanation / generated examples / generated words**: 영향 없음 (다른 팩의 데이터)

`character` 가 동일해도 **팩가 다르면 별개의 row** 입니다. `一` 이 N5 와 `토비라-1과` 양쪽에 있을 수 있고, 각각 독립적인 단어/예문/해설을 가집니다.
