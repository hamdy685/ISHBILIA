import { useState, useEffect } from 'react';

/**
 * Custom Hook: useDebounce
 * Delays updating the debounced value until after the specified delay has elapsed
 * since the last time the value was modified.
 *
 * @param value The raw input/filter value to debounce
 * @param delay Milliseconds to delay (default: 400ms, between 300ms and 500ms)
 * @returns The debounced value
 */
export function useDebounce<T>(value: T, delay: number = 400): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

export default useDebounce;
