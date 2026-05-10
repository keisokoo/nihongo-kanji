import { useEffect, useState } from "react";
import { isFavorite, toggleFavorite } from "~/lib/idb/favorites";
import type { FavoriteKind } from "~/lib/idb/types";

/**
 * 별 아이콘 토글. 한자/단어/문법 항목에 공통 사용.
 * 마운트 시 IDB 에서 현재 상태 fetch — initial 을 prop 으로도 받을 수 있음.
 */
export function FavoriteToggle({
  itemKind,
  itemId,
  initialFavorited,
  size = "md",
}: {
  itemKind: FavoriteKind;
  itemId: number;
  initialFavorited?: boolean;
  size?: "sm" | "md";
}) {
  const [fav, setFav] = useState<boolean | null>(initialFavorited ?? null);

  useEffect(() => {
    if (initialFavorited !== undefined) return;
    let cancelled = false;
    (async () => {
      const v = await isFavorite(itemKind, itemId);
      if (!cancelled) setFav(v);
    })();
    return () => {
      cancelled = true;
    };
  }, [itemKind, itemId, initialFavorited]);

  async function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = await toggleFavorite(itemKind, itemId);
    setFav(next);
  }

  const sizeCls =
    size === "sm" ? "h-7 w-7 text-sm" : "h-9 w-9 text-base";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={fav ?? false}
      aria-label={fav ? "즐겨찾기 해제" : "즐겨찾기"}
      title={fav ? "즐겨찾기 해제" : "즐겨찾기 추가"}
      className={`inline-flex shrink-0 items-center justify-center rounded-full border transition ${sizeCls} ${
        fav
          ? "border-amber-300 bg-amber-50 text-amber-500 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
          : "border-neutral-200 text-neutral-400 hover:bg-neutral-100 hover:text-amber-500 dark:border-neutral-700 dark:hover:bg-neutral-800"
      }`}
    >
      {fav ? "★" : "☆"}
    </button>
  );
}
