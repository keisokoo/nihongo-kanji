# Nihongo

JLPT N5–N1 한자 학습 PWA. 백엔드 없음 — 모든 데이터는 브라우저의 IndexedDB.
시드 (한자/단어/예문 ~7,500개)는 첫 부팅에 한 번 적재하면 끝. AI 호출 (단어
생성·예문·해설·TTS)은 사용자 본인 키로 브라우저에서 직접 Anthropic / Google AI에 붙음.

## 핵심 동작

- **저장**: Dexie (IndexedDB 래퍼). 팩 / 한자 / readings / 단어 / 예문 /
  단어 시험 / TTS 캐시 / 설정 9개 객체 스토어
- **AI**: ANTHROPIC_API_KEY 있으면 Claude (Haiku 4.5 / Sonnet 4.6 fallback),
  없고 GEMINI_API_KEY 있으면 Gemini (3.1-flash-lite / 3-flash-preview).
  키는 AES-GCM 256으로 암호화해 IDB 보관 (wrapping key non-extractable)
- **TTS**: Gemini 3.1-flash-tts-preview (Kore voice). WAV blob을 IDB에 캐시
- **PWA**: vite-plugin-pwa (manifest) + Workbox post-build SW (앱 셸 + 시드
  precache, Google Fonts SWR). 설치 가능 + 오프라인 (AI 호출 제외)

## 학습 기능

- 한자 카드 (음/훈독 + 의미, 발음 ♪, ↻ AI로 음/훈독·의미 재생성)
- 한자 페이지의 4지선다 발음 퀴즈 + 예문 자동 생성
- 단어별 💡 해설 (왜 이 발음인지 — 음편화/연탁/숙자훈) + 📖 예문 해설
  (늬앙스/문법/발음/학습 포인트)
- 단어 시험 (시험장 생성 → 두 모드: 단어 시험 = JP↔KO 4지선다, 한자 읽기 =
  예문 prompt + 발음·뜻 두 단계)
- AI 키 미설정 시 AI 버튼은 disable + tooltip 안내. 학습 자체는 그대로 가능

## 시작하기

```sh
npm install
npm run dev          # https://localhost:5173 (자가서명 인증서)
```

> dev 서버는 자가서명 HTTPS로 뜸 (`@vitejs/plugin-basic-ssl`). 처음 접속 시
> 브라우저가 인증서 신뢰 확인을 요구함. **WebCrypto / Service Worker는
> secure context 한정**이라 HTTPS가 필수.

**모바일 / LAN 테스트**: vite가 `host: true`로 떠 있으니
`https://192.168.x.x:5173` 처럼 같은 네트워크 다른 기기에서도 접속 가능.
폰 사파리/크롬에선 한 번 인증서 신뢰 후 사용. **HTTP LAN IP는 안 됨** (키
저장이 silent fail).

첫 방문 시 InitGate가 셋업 화면을 띄움:
1. ANTHROPIC_API_KEY (선택) — Claude 텍스트 생성
2. GEMINI_API_KEY (선택) — Gemini TTS (+ Anthropic 키 없을 때 텍스트 fallback)
3. 시드 설치 (자동) — `public/seed/n5..n1.json` → IDB

키 둘 다 비워둬도 학습은 가능. AI / TTS는 동작 안 함.

## 빌드 & 배포

```sh
npm run build        # 정적 자산 → build/client/
npm run preview      # 로컬 정적 서빙 확인
```

`build/client/` 를 그대로 어떤 정적 호스트에든 올리면 됨 (Cloudflare Pages,
Vercel static, Netlify, GitHub Pages 등). 서버 런타임 필요 없음.

배포 시 권장 응답 헤더:

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self' https://fonts.googleapis.com 'unsafe-inline';
  font-src 'self' https://fonts.gstatic.com;
  img-src 'self' data: blob:;
  connect-src 'self' https://api.anthropic.com https://generativelanguage.googleapis.com;
  manifest-src 'self';
  worker-src 'self';
```

## 스크립트

| script | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 (HMR, http://localhost:5173) |
| `npm run build` | RR build → 정적 SPA + Workbox SW (`build/client/`) |
| `npm run preview` | `build/client/` 정적 서빙 (배포 전 확인용) |
| `npm run typecheck` | RR typegen + tsc |
| `npm run seed:sync` | `scripts/data/*.json` → `public/seed/` 복사 + manifest 재생성 |

## 디렉토리

```
app/
├── components/
│   ├── KanjiCard.tsx
│   ├── WordQuizSection.tsx
│   ├── SentenceRender.tsx
│   ├── ExampleExplanationPanel.tsx
│   ├── InitGate.tsx              # 첫 부팅 셋업 화면
│   ├── ConfirmModal.tsx
│   ├── Spinner.tsx
│   ├── Toast.tsx
│   └── home/                      # PackCard / TestCard / ImportButton / CreateTestModal
├── lib/
│   ├── idb/                       # 도메인 + Dexie 액세스
│   │   ├── types.ts
│   │   ├── db.ts
│   │   ├── settings.ts            # AES-GCM 암호화 키 보관
│   │   ├── seed-install.ts
│   │   ├── pack.ts                # importPack
│   │   ├── pack-export.ts         # 다운로드용 export (jlpt-delta / custom-full)
│   │   ├── pack-import-delta.ts   # delta 적용 (replace / merge)
│   │   ├── home.ts                # loadHomeData
│   │   ├── word-test.ts           # createWordTest / answerItem / delete
│   │   ├── word-add.ts            # addAiWord (단어 + 예문 묶음)
│   │   ├── example-actions.ts     # 예문/해설/한자 readings 재생성
│   │   ├── claude.ts              # Anthropic + Gemini 클라이언트 래퍼
│   │   ├── tts.ts                 # Gemini TTS (blob 캐시)
│   │   ├── usage.ts               # 저장소 사용량
│   │   └── use-ai-availability.ts # AI 키 보유 여부 훅
│   ├── sentence.ts                # 인라인 마크업 파서 (universal)
│   └── useTtsPlayer.tsx
├── routes/
│   ├── home.tsx                   # 메인 (팩 + 단어 시험 카드)
│   ├── study-index.tsx            # /study/:level → 첫 한자로 redirect
│   ├── study.tsx                  # /study/:level/:id
│   ├── word-test.tsx              # /word-test/:id
│   └── settings.tsx               # /settings
├── routes.ts
├── root.tsx                       # InitGate + Toaster mount
├── sw.ts                          # 커스텀 Workbox SW
└── app.css

public/
├── seed/                          # 시드 JSON 5개 + manifest.json (sync-seed 산출물)
├── pwa-icon.svg                   # PWA 아이콘 (학 + N 마크)
└── pwa-{192,512}*.png             # placeholder PNG fallback

scripts/
├── build-sw.mjs                   # post-build Workbox SW 생성
├── sync-seed.mjs                  # scripts/data → public/seed
└── data/                          # 시드 원본 + AI fill 도구
    ├── n{5..1}.json
    ├── _ai_fill_merge.py
    ├── _ai_meaning_update.py
    ├── AI_FILL_PROMPT.md          # cowork/AI 작업자용 가이드
    └── README.md
```

## 시드 데이터 보강

시드는 [`scripts/data/`](scripts/data/) 가 정본. 새 단어·예문·해설 추가는
[`scripts/data/AI_FILL_PROMPT.md`](scripts/data/AI_FILL_PROMPT.md) 참고.
변경 후:

```sh
npm run seed:sync     # public/seed/ + manifest.json 갱신
npm run build         # 새 시드 포함된 SW 재생성
```

기존 사용자는 `/settings` 에서 "시드 다시 설치" 버튼을 누르면 IDB 시드만
갱신됨 (AI 추가 데이터는 보존).

## 데이터 공유

- **다운로드**: 메인 화면에서 각 팩 카드 우상단 ⬇ 클릭 → JSON 저장
  - JLPT 팩: AI 추가분만 (`jlpt-delta`)
  - 커스텀 팩: 전체 (`custom-full`)
- **가져오기**: 메인 헤더 `+ JSON 가져오기` → 자동 감지
  - jlpt-delta → 모달로 병합/교체 선택 (시드 데이터는 보존)
  - custom-full / raw 시드 형식 → 새 팩으로 추가

## 보안 모델

API 키는 IndexedDB에 AES-GCM 256으로 암호화해서 저장하고, 암호화 키 자체는
non-extractable CryptoKey로 보관. 다음을 막아줌:

- DevTools "Application → IndexedDB" 인스펙터에서 평문 노출
- 디스크 백업 / 동기화로 키가 빠져나감
- 가벼운 캐주얼 노출 (다른 사람에게 폰 잠깐 빌려줌 등)

다음은 막지 못함 (구조적 한계):

- XSS — 같은 origin에서 임의 JS가 실행되면 `subtle.decrypt`를 똑같이 호출 가능
- 악성 브라우저 확장 — 같은 origin 권한이 있으면 동일

근본 방어는 CSP 헤더 + 코드 리뷰 (innerHTML / dangerouslySetInnerHTML 금지).
이 앱은 React 기본 escape에만 의존하고 위 패턴을 0건 사용. 배포 시 §빌드의
CSP 헤더 셋업 권장.
