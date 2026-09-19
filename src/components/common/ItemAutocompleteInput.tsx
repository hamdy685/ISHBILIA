import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useItemSuggestions } from '../../hooks/useItemSuggestions';

export interface ItemAutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  error?: boolean;
  className?: string;
  id?: string;
  name?: string;
  autoFocus?: boolean;
  onBlur?: () => void;
}

export const ItemAutocompleteInput: React.FC<ItemAutocompleteInputProps> = ({
  value,
  onChange,
  placeholder = 'اسم الصنف أو المادة المطلوبة...',
  disabled = false,
  required = false,
  error = false,
  className = '',
  id,
  name,
  autoFocus = false,
  onBlur,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isFocused, setIsFocused] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Hook with 300ms debounce
  const { suggestions, isLoading } = useItemSuggestions(value, {
    debounceMs: 300,
    enabled: isFocused && !disabled,
    minLength: 1,
  });

  // Open dropdown if we have suggestions and are focused
  useEffect(() => {
    if (isFocused && suggestions.length > 0) {
      setIsOpen(true);
    } else if (suggestions.length === 0) {
      setIsOpen(false);
    }
  }, [suggestions, isFocused]);

  // Reset highlighted index when suggestions change
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [suggestions]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Handle selection of a suggestion
  const handleSelectSuggestion = useCallback(
    (suggestion: string) => {
      onChange(suggestion);
      setIsOpen(false);
      setHighlightedIndex(-1);
      inputRef.current?.focus();
    },
    [onChange]
  );

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (!isOpen || suggestions.length === 0) {
      if (e.key === 'ArrowDown' && suggestions.length > 0) {
        setIsOpen(true);
        setHighlightedIndex(0);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        break;

      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
        break;

      case 'Enter':
        if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
          e.preventDefault();
          handleSelectSuggestion(suggestions[highlightedIndex]);
        }
        break;

      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;

      case 'Tab':
        if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
          handleSelectSuggestion(suggestions[highlightedIndex]);
        } else {
          setIsOpen(false);
        }
        break;

      default:
        break;
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const items = listRef.current.children;
      const el = items[highlightedIndex] as HTMLElement | undefined;
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({
          block: 'nearest',
        });
      }
    }
  }, [highlightedIndex]);

  // Highlight matched search text
  const renderHighlightedText = (text: string, query: string) => {
    if (!query.trim()) return text;

    const trimmedQuery = query.trim();
    const index = text.toLowerCase().indexOf(trimmedQuery.toLowerCase());

    if (index === -1) return text;

    const before = text.slice(0, index);
    const match = text.slice(index, index + trimmedQuery.length);
    const after = text.slice(index + trimmedQuery.length);

    return (
      <span>
        {before}
        <span className="text-cyan-400 font-bold underline decoration-cyan-500/50">
          {match}
        </span>
        {after}
      </span>
    );
  };

  return (
    <div ref={containerRef} className="relative w-full" dir="rtl">
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          id={id}
          name={name}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            if (!isOpen && isFocused) {
              setIsOpen(true);
            }
          }}
          onFocus={() => {
            setIsFocused(true);
            if (suggestions.length > 0) {
              setIsOpen(true);
            }
          }}
          onBlur={() => {
            setIsFocused(false);
            onBlur?.();
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          autoFocus={autoFocus}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={id ? `${id}-suggestions` : undefined}
          className={`w-full rounded-xl border bg-slate-900/90 px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 transition-all focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${
            error
              ? 'border-rose-500/80 focus:border-rose-500 focus:ring-rose-500/20'
              : 'border-slate-800 hover:border-slate-700 focus:border-cyan-500 focus:ring-cyan-500/20'
          } ${isLoading ? 'pl-8' : ''} ${className}`}
        />

        {/* Loading Spinner Indicator */}
        {isLoading && (
          <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
            <svg
              className="animate-spin h-3.5 w-3.5 text-cyan-400"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Floating Suggestions Dropdown */}
      {isOpen && suggestions.length > 0 && (
        <ul
          ref={listRef}
          id={id ? `${id}-suggestions` : undefined}
          role="listbox"
          className="absolute z-50 mt-1.5 max-h-60 w-full overflow-auto rounded-xl border border-slate-700/80 bg-slate-900/95 py-1.5 text-xs text-slate-200 shadow-2xl backdrop-blur-lg focus:outline-none scrollbar-thin scrollbar-thumb-slate-700"
        >
          <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800/80 flex items-center justify-between">
            <span>اقتراحات سابقة من النظام</span>
            <span className="text-cyan-400/80 font-mono text-[9px]">
              {suggestions.length} مقترح
            </span>
          </div>

          {suggestions.map((suggestion, idx) => {
            const isHighlighted = idx === highlightedIndex;
            return (
              <li
                key={`${suggestion}-${idx}`}
                role="option"
                aria-selected={isHighlighted}
                onMouseDown={(e) => {
                  // Prevent input blur before click registers
                  e.preventDefault();
                  handleSelectSuggestion(suggestion);
                }}
                onMouseEnter={() => setHighlightedIndex(idx)}
                className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors ${
                  isHighlighted
                    ? 'bg-cyan-950/60 text-cyan-200 font-semibold'
                    : 'hover:bg-slate-800/60 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap">
                  <span className="text-slate-500 text-xs">📦</span>
                  <span>{renderHighlightedText(suggestion, value)}</span>
                </div>
                {isHighlighted && (
                  <span className="text-[10px] text-cyan-400 bg-cyan-900/50 px-1.5 py-0.5 rounded border border-cyan-800/50 font-mono">
                    اختر ↵
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default ItemAutocompleteInput;
