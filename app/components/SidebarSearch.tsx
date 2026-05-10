/**
 * 사이드바 상단에 끼우는 검색 입력. 한자/문법/단어 시험 사이드바 공용.
 * 키보드: Esc 로 비우기, Enter 는 form submit 방지.
 */
export function SidebarSearch({
  value,
  onChange,
  placeholder = "검색 (한국어 / 일본어)",
  count,
  total,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** 필터 후 보이는 항목 수 — 검색 중일 때만 표시 */
  count?: number;
  total?: number;
}) {
  const filtering = value.trim().length > 0;
  return (
    <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
      <div className="relative">
        <input
          type="search"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onChange("");
            }
          }}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="w-full rounded-md border border-neutral-200 bg-white px-3 py-1.5 pr-7 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500"
        />
        {filtering && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="검색 지우기"
            className="absolute right-1.5 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-xs text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            ✕
          </button>
        )}
      </div>
      {filtering && count !== undefined && total !== undefined && (
        <div className="mt-1.5 text-xs tabular-nums text-neutral-500">
          {count} / {total}
        </div>
      )}
    </div>
  );
}
