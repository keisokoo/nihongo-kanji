import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("study/:level", "routes/study-index.tsx"),
  route("study/:level/:id", "routes/study.tsx"),
  route("word-test/:id", "routes/word-test.tsx"),
  route("settings", "routes/settings.tsx"),
] satisfies RouteConfig;
