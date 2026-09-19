import { useState, useEffect, useRef } from 'react';
import { getItemSuggestionsApi } from '../api/catalog';

interface UseItemSuggestionsOptions {
  debounceMs?: number;
  enabled?: boolean;
  minLength?: number;
}

// Global in-memory cache to share suggestions across components and avoid redundant API requests
const suggestionsCache = new Map<string, string[]>();

export const useItemSuggestions = (
  query: string,
  options: UseItemSuggestionsOptions = {}
) => {
  const { debounceMs = 300, enabled = true, minLength = 1 } = options;

  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const activeQueryRef = useRef<string>(query);
  activeQueryRef.current = query;

  useEffect(() => {
    const trimmed = (query || '').trim();

    // If query is empty or shorter than minimum required length, clear suggestions
    if (!enabled || trimmed.length < minLength) {
      setSuggestions([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Check cache first for instant retrieval
    const cacheKey = trimmed.toLowerCase();
    if (suggestionsCache.has(cacheKey)) {
      setSuggestions(suggestionsCache.get(cacheKey) || []);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    const timer = setTimeout(async () => {
      try {
        const results = await getItemSuggestionsApi(trimmed);
        suggestionsCache.set(cacheKey, results);

        // Only update state if the query hasn't changed while awaiting response
        if (activeQueryRef.current.trim().toLowerCase() === cacheKey) {
          setSuggestions(results);
          setIsLoading(false);
        }
      } catch (err: any) {
        if (activeQueryRef.current.trim().toLowerCase() === cacheKey) {
          setError(err?.message || 'فشل جلب الاقتراحات');
          setIsLoading(false);
        }
      }
    }, debounceMs);

    return () => {
      clearTimeout(timer);
    };
  }, [query, debounceMs, enabled, minLength]);

  return { suggestions, isLoading, error };
};
