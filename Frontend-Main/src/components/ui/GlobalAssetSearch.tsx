import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search, X } from 'lucide-react';
import { analysisService, type AssetSearchResult } from '@/services';
import { useDebounce } from '@/hooks/useDebounce';
import { ROUTES } from '@/constants/routes';

export function GlobalAssetSearch() {
  const [searchInput, setSearchInput] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const debouncedSearch = useDebounce(searchInput, 300);

  const { data: searchData, isFetching } = useQuery({
    queryKey: ['global-asset-search', debouncedSearch],
    queryFn: () => analysisService.searchAsset(debouncedSearch),
    enabled: debouncedSearch.length >= 1 && searchOpen,
    staleTime: 30_000,
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectResult = (result: AssetSearchResult) => {
    setSearchInput('');
    setSearchOpen(false);
    navigate(`${ROUTES.RESEARCH_LAB}?symbol=${encodeURIComponent(result.symbol)}`);
  };

  const results: AssetSearchResult[] = searchData ?? [];

  return (
    <div ref={searchRef} className="relative hidden w-80 md:block">
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-altrion-400" />
        <input
          type="text"
          value={searchInput}
          placeholder="Search stocks, ETFs, crypto…"
          onChange={(e) => { setSearchInput(e.target.value); setSearchOpen(true); }}
          onFocus={() => setSearchOpen(true)}
          className="w-full rounded-xl border border-white/15 bg-dark-surface py-2 pl-10 pr-8 text-sm text-text-primary placeholder:text-text-muted focus:border-altrion-500/60 focus:outline-none focus:ring-1 focus:ring-altrion-500/30 transition-colors"
        />
        {searchInput && (
          <button
            type="button"
            onClick={() => { setSearchInput(''); setSearchOpen(false); }}
            className="absolute right-2.5 text-text-muted hover:text-text-primary"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {searchOpen && (isFetching || results.length > 0) && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-full overflow-hidden rounded-xl border border-white/15 bg-dark-surface shadow-2xl">
          {isFetching && (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
            </div>
          )}
          {!isFetching && results.map((r) => (
            <button
              key={r.symbol}
              type="button"
              onClick={() => selectResult(r)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5"
            >
              <span className="w-14 shrink-0 font-mono text-sm text-text-primary">{r.symbol}</span>
              <span className="truncate text-xs text-text-muted">{r.name}</span>
              <span className="ml-auto shrink-0 rounded bg-white/6 px-1.5 py-0.5 text-[10px] text-text-muted">
                {r.exchangeShortName}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
