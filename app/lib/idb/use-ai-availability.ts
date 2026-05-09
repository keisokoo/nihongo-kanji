import { useEffect, useState } from "react";
import { loadSettings } from "./settings";

export type AiAvailability = {
  /** True once the initial load completed (don't render until ready). */
  ready: boolean;
  /** Anthropic key set. */
  hasAnthropic: boolean;
  /** Gemini key set. */
  hasGemini: boolean;
  /** Either AI key is set — text generation is possible. */
  hasAi: boolean;
  /** Gemini key is set — TTS is possible. */
  hasTts: boolean;
};

const INITIAL: AiAvailability = {
  ready: false,
  hasAnthropic: false,
  hasGemini: false,
  hasAi: false,
  hasTts: false,
};

/**
 * Reads settings once on mount and exposes which AI capabilities are usable.
 * Use to gate AI-call buttons. Settings page edits won't reactively propagate
 * — components on the page that rely on live updates should re-mount or
 * re-load on navigation. Good enough for our flows.
 */
export function useAiAvailability(): AiAvailability {
  const [state, setState] = useState<AiAvailability>(INITIAL);

  useEffect(() => {
    let cancelled = false;
    loadSettings().then((s) => {
      if (cancelled) return;
      const hasAnthropic = !!s.anthropicApiKey;
      const hasGemini = !!s.geminiApiKey;
      setState({
        ready: true,
        hasAnthropic,
        hasGemini,
        hasAi: hasAnthropic || hasGemini,
        hasTts: hasGemini,
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
