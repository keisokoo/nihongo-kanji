import { useCallback, useRef, useState } from "react";

const memoryCache = new Map<string, string>();

type State = { loading: boolean; error: string | null };

export function useTtsPlayer() {
  const [state, setState] = useState<State>({ loading: false, error: null });
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const play = useCallback(async (text: string, voice?: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    const key = `${voice ?? ""}|${text}`;
    let url = memoryCache.get(key);

    if (!url) {
      setState({ loading: true, error: null });
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `TTS request failed (${res.status})`);
        }
        const data = (await res.json()) as { url: string };
        url = data.url;
        memoryCache.set(key, url);
      } catch (err) {
        const message = err instanceof Error ? err.message : "TTS failed";
        setState({ loading: false, error: message });
        return;
      }
    }

    const audio = new Audio(url);
    audioRef.current = audio;
    setState({ loading: false, error: null });
    void audio.play();
  }, []);

  return { play, ...state };
}
