import { useCallback, useEffect, useRef, useState } from "react";
import { showToast } from "~/components/Toast";

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

  const play = useCallback(async (text: string, voice?: string) => {
    audioRef.current?.pause();
    setState({ loading: true, loadingText: text, error: null });

    const key = `${voice ?? ""}|${text}`;
    let url = blobUrlCache.get(key);

    if (!url) {
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice }),
        });
        if (!res.ok) {
          let message = `TTS request failed (${res.status})`;
          try {
            const body = (await res.json()) as { error?: string };
            if (body.error) message = body.error;
          } catch {
            // not JSON; keep default message
          }
          throw new Error(message);
        }
        const cached = res.headers.get("X-Cached") === "1";
        const ttsModel = res.headers.get("X-Tts-Model");
        const inTok = Number(res.headers.get("X-Tts-Input-Tokens") ?? "0");
        const outTok = Number(res.headers.get("X-Tts-Output-Tokens") ?? "0");
        const totalTok = Number(res.headers.get("X-Tts-Total-Tokens") ?? "0");
        if (!cached && ttsModel) {
          const total = totalTok || inTok + outTok;
          showToast(
            <div className="min-w-[16rem]">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-neutral-900 dark:text-neutral-100">
                  ♪ TTS 생성
                </span>
                <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                  {ttsModel.replace(/^gemini-/, "")}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
                <span>입력 {inTok.toLocaleString()}</span>
                <span>출력 {outTok.toLocaleString()}</span>
                <span className="text-neutral-400">
                  합계 {total.toLocaleString()}
                </span>
              </div>
            </div>,
          );
        }
        const blob = await res.blob();
        url = URL.createObjectURL(blob);
        blobUrlCache.set(key, url);
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
      // play() resolves once playback has actually started.
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
