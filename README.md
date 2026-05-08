# Nihongo

N3 합격을 위한 N5/N4/N3 필수 한자 학습 앱.

## 스택

- **Frontend**: React Router 7 (framework mode, SSR)
- **Styling**: Tailwind CSS v4
- **DB**: PostgreSQL + Drizzle ORM
- **TTS**: Gemini TTS (서버에서 합성 → `public/audio/`에 캐시)

## 기능

- 레벨별(N5/N4/N3) 한자 학습
- 한자별 음독/훈독 표시 — 클릭하면 발음 재생 (한 번 생성된 발음은 파일로 캐시되어 재사용)
- 한자가 쓰인 예문 퀴즈 (음독/훈독 4지선다)

## 디렉토리 구조

```
app/
├── components/
│   ├── KanjiCard.tsx       # 한자 + 음독/훈독 (TTS 재생 버튼)
│   └── ExampleQuiz.tsx     # 예문 4지선다
├── lib/
│   ├── db/                 # drizzle client + schema
│   ├── tts.server.ts       # Gemini TTS + 파일 캐시
│   └── useTtsPlayer.ts     # 클라이언트 hook (메모리 캐시 + 재생)
├── routes/
│   ├── home.tsx            # 레벨 선택
│   ├── study.tsx           # /study/:level
│   ├── quiz.tsx            # /quiz/:kanjiId
│   └── api.tts.ts          # POST /api/tts
└── routes.ts
public/audio/               # TTS 캐시 (gitignore)
```

## 시작하기

```sh
cp .env.example .env       # GEMINI_API_KEY 입력
npm install
npm run db:up              # postgres (docker)
npm run db:generate        # drizzle 마이그레이션 생성
npm run db:migrate         # 적용
npm run dev                # http://localhost:5173
```

## 스크립트

| script | 설명 |
| --- | --- |
| `npm run dev` | RR7 dev 서버 (HMR) |
| `npm run build` / `npm start` | 프로덕션 빌드/실행 |
| `npm run typecheck` | RR7 typegen + tsc |
| `npm run db:up` / `db:down` | 로컬 postgres docker |
| `npm run db:generate` / `db:migrate` / `db:studio` | drizzle |

## 데이터 시딩

한자/읽기/예문 시드 스크립트는 별도 작업으로. 스키마는 [`app/lib/db/schema.ts`](app/lib/db/schema.ts) 참고.
