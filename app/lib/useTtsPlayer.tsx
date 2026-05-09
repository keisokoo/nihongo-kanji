import { useCallback, useEffect, useRef, useState } from "react";
import { showToast } from "~/components/Toast";
import { synthesize } from "~/lib/idb/tts";

const blobUrlCache = new Map<string, string>();

type State = {
  loading: boolean;
  loadingText: string | null;
  error: string | null;
};

const initialState: State = { loading: false, loadingText: null, error: null };

export function useTtsPlayer() {
  const [state, setState] = useState<State>(initialState);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      audioRef.current?.pause();
    };
  }, []);

  const play = useCallback(async (text: string) => {
    audioRef.current?.pause();
    setState({ loading: true, loadingText: text, error: null });

    let url = blobUrlCache.get(text);

    if (!url) {
      try {
        const { blob, cached, usage } = await synthesize(text);
        if (!cached && usage) {
          const total = usage.totalTokens || usage.inputTokens + usage.outputTokens;
          showToast(
            <div className="min-w-[16rem]">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-neutral-900 dark:text-neutral-100">
                  ♪ TTS 생성
                </span>
                <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                  {usage.model.replace(/^gemini-/, "")}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
                <span>입력 {usage.inputTokens.toLocaleString()}</span>
                <span>출력 {usage.outputTokens.toLocaleString()}</span>
                <span className="text-neutral-400">
                  합계 {total.toLocaleString()}
                </span>
              </div>
            </div>,
          );
        }
        url = URL.createObjectURL(blob);
        blobUrlCache.set(text, url);
      } catch (err) {
        if (!aliveRef.current) return;
        const message = err instanceof Error ? err.message : "TTS failed";
        setState({ loading: false, loadingText: null, error: message });
        return;
      }
    }

    if (!aliveRef.current) return;

    const audio = new Audio(url);
    audioRef.current = audio;

    try {
      await audio.play();
      if (aliveRef.current) {
        setState({ loading: false, loadingText: null, error: null });
      }
    } catch (err) {
      if (!aliveRef.current) return;
      const message = err instanceof Error ? err.message : "playback failed";
      setState({ loading: false, loadingText: null, error: message });
    }
  }, []);

  return { play, ...state };
}
