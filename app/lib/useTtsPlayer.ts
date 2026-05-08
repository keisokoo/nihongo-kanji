import { useCallback, useEffect, useRef, useState } from "react";

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
