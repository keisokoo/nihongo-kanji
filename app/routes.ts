import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("study/:level", "routes/study-index.tsx"),
  route("study/:level/:id", "routes/study.tsx"),
  route("api/tts", "routes/api.tts.ts"),
  route("api/example", "routes/api.example.ts"),
  route("api/word", "routes/api.word.ts"),
  route("api/readings", "routes/api.readings.ts"),
  route("api/explanation", "routes/api.explanation.ts"),
  route("api/example-explanation", "routes/api.example-explanation.ts"),
  route("api/pack/import", "routes/api.pack.import.ts"),
  route("api/word-test/create", "routes/api.word-test.create.ts"),
  route("api/word-test/answer", "routes/api.word-test.answer.ts"),
  route("word-test/:id", "routes/word-test.tsx"),
] satisfies RouteConfig;
