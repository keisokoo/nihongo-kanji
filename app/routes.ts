import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("study/:level", "routes/study.tsx"),
  route("quiz/:kanjiId", "routes/quiz.tsx"),
  route("api/tts", "routes/api.tts.ts"),
] satisfies RouteConfig;
