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
npm run dev          # http://localhost:5173
```

> **WebCrypto / Service Worker는 secure context 한정**. `localhost` 는
> 평문 HTTP라도 secure context로 취급되니 데스크톱 개발은 그대로 OK.
> LAN IP HTTP (`http://192.168.x.x:5173`) 는 secure context가 아니라 키
> 저장이 silent fail — 모바일/다른 기기에서 테스트하려면 아래 cloudflared
> 항목 참고.

첫 방문 시 InitGate가 셋업 화면을 띄움:
1. ANTHROPIC_API_KEY (선택) — Claude 텍스트 생성
2. GEMINI_API_KEY (선택) — Gemini TTS (+ Anthropic 키 없을 때 텍스트 fallback)
3. 시드 설치 (자동) — `public/seed/n5..n1.json` → IDB

키 둘 다 비워둬도 학습은 가능. AI / TTS는 동작 안 함.

## 빌드 & 배포

```sh
npm run build        # 정적 자산 → build/client/ + Workbox sw.js
npm run preview      # http://localhost:4173 (서비스 워커 + 오프라인 작동)
```

> **PWA / 오프라인 테스트**는 반드시 `npm run preview` 로 해야 함. `npm run
> dev` 에선 sw.js 가 생성되지 않아 홈 화면 추가는 되지만 오프라인이 안 됨.

### 데스크톱 오프라인 검증

```sh
npm run build && npm run preview
# http://localhost:4173 접속
```

DevTools → Application → Service Workers 에서 `sw.js` activated 확인 →
Network 탭에서 "Offline" 체크 → 새로고침 시 정상 로딩되면 SW 동작 OK.

### 모바일 오프라인 검증 (사파리)

iOS 사파리는 secure context 가 아니면 Service Worker 등록을 silent 거부함.
LAN IP HTTP (`http://192.168.x.x:4173`) 로는 PWA 추가까지는 되지만 SW 가
등록 안 되어 오프라인이 안 됨. 진짜 HTTPS cert 가 필요함.

가장 빠른 방법: `cloudflared` 터널 (외부엔 진짜 Let's Encrypt cert 로 HTTPS
제공, origin 은 평문 localhost).

#### 옵션 A — Quick tunnel (즉석 / URL 매번 바뀜)

```sh
brew install cloudflared
# 빌드 + preview 띄운 상태에서, 별도 터미널:
cloudflared tunnel --url http://localhost:4173
# → https://xxx-yyy-zzz.trycloudflare.com 발급
```

#### 옵션 B — Named tunnel (영구 / 본인 도메인)

본인 도메인이 Cloudflare 에 있으면 한 번 셋업 후 `cloudflared tunnel run`
한 줄로 같은 URL 재사용.

```sh
cloudflared tunnel login                  # 도메인을 cloudflared 에 권한 부여
cloudflared tunnel create nihongo         # ~/.cloudflared/<UUID>.json 생성
cloudflared tunnel route dns nihongo nihongo.example.com
```

repo 루트에 `.cloudflared/config.yml` 두기 (gitignore 처리됨):

```yaml
tunnel: <UUID>
credentials-file: /Users/you/.cloudflared/<UUID>.json
ingress:
  - hostname: nihongo.example.com
    service: http://localhost:4173
  - service: http_status:404
```

```sh
npm run build && npm run preview          # 한 터미널
cloudflared tunnel --config .cloudflared/config.yml run nihongo  # 다른 터미널
```

폰 사파리에서:
1. cloudflared 가 준 URL (`https://xxx.trycloudflare.com` 또는 본인 도메인) 접속
2. 인증서 경고 없이 정상 로딩 → 셋업 완료
3. 페이지 둘러보기 (~10초, SW 가 background 에서 5MB precache)
4. 공유 → 홈 화면에 추가
5. **비행기 모드 ON** → 홈 화면 아이콘으로 진입 → 오프라인 동작 확인

> Quick tunnel URL 은 cloudflared 끄면 사라짐. 영구 URL 이 필요하면 옵션 B
> 또는 정식 배포 (아래 문단).

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
| `npm run dev` | 개발 서버 (HMR, http://localhost:5173) — secure context는 localhost 한정 |
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
