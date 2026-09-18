import React, { useState } from 'react';
import { Button } from './Button';
import { Card } from './Card';
import { Input, Select } from './FormField';

export interface TableFilterOption {
  value: string;
  label: string;
}

export interface TableFilterSelect {
  label: string;
  value: string;
  options: TableFilterOption[];
  onChange: (value: string) => void;
}

interface TableFilterBarProps {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  selects?: TableFilterSelect[];
  dateFrom?: string;
  dateTo?: string;
  onDateFromChange?: (value: string) => void;
  onDateToChange?: (value: string) => void;
  onClear?: () => void;
  hasActiveFilters?: boolean;
  resultCount: number;
  totalCount?: number;
  resultLabel?: string;
  className?: string;
  defaultExpanded?: boolean;
}

export const TableFilterBar: React.FC<TableFilterBarProps> = ({
  searchValue = '',
  onSearchChange,
  searchPlaceholder = 'بحث في البيانات...',
  selects = [],
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  onClear,
  hasActiveFilters = false,
  resultCount,
  totalCount,
  resultLabel = 'سجل',
  className = '',
  defaultExpanded = false,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded || hasActiveFilters);
  const hasDateFilter = onDateFromChange || onDateToChange;
  const invalidDateRange = Boolean(dateFrom && dateTo && dateFrom > dateTo);
  const hasExtraFilters = selects.length > 0 || Boolean(hasDateFilter);

  // Count active non-search filters
  const activeFiltersCount = (
    selects.filter(s => Boolean(s.value)).length +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0)
  );

  return (
    <Card className={`space-y-3.5 border-slate-800 bg-slate-900/90 ${className}`}>
      {/* Top Search & Toggle Bar */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        {onSearchChange ? (
          <div className="relative flex-1 min-w-0">
            <Input
              type="search"
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="w-full pl-8"
            />
          </div>
        ) : (
          <div className="text-xs font-bold text-slate-300 flex items-center gap-2">
            <span>🔍</span> فلترة وتصفية البيانات
          </div>
        )}

        {hasExtraFilters && (
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-xs font-black transition-all border shrink-0 ${
              isExpanded || activeFiltersCount > 0
                ? 'bg-gold-950/80 text-gold-300 border-gold-500/60 shadow-md shadow-gold-950/30'
                : 'bg-white/[0.04] text-slate-300 border-white/10 hover:border-gold-500/40 hover:bg-white/[0.08] hover:text-white'
            }`}
            aria-expanded={isExpanded}
          >
            <span>🎛️</span>
            <span>{isExpanded ? 'إخفاء الفلاتر' : 'خيارات الفلترة'}</span>
            {activeFiltersCount > 0 && (
              <span className="rounded-full bg-gold-400 px-1.5 py-0.2 text-[10px] font-black text-slate-950">
                {activeFiltersCount}
              </span>
            )}
            <span className="text-[10px] text-slate-400 font-mono">
              {isExpanded ? '▲' : '▼'}
            </span>
          </button>
        )}
      </div>

      {/* Collapsible Advanced Filters Section with Smooth Height & Opacity Transition */}
      {hasExtraFilters && (
        <div
          className={`transition-all duration-300 ease-in-out overflow-hidden ${
            isExpanded
              ? 'max-h-[600px] opacity-100 pt-3 border-t border-white/10'
              : 'max-h-0 opacity-0 pt-0 border-t-0 pointer-events-none'
          }`}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {selects.map((filter) => (
              <label key={filter.label} className="flex min-w-0 flex-col gap-1.5 text-[11px] font-bold text-slate-400">
                <span>{filter.label}</span>
                <Select value={filter.value} onChange={(event) => filter.onChange(event.target.value)}>
                  {filter.options.map((option) => (
                    <option key={`${filter.label}-${option.value}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </label>
            ))}

            {hasDateFilter && (
              <label className="flex min-w-0 flex-col gap-1.5 text-[11px] font-bold text-slate-400">
                <span>من تاريخ</span>
                <Input
                  type="date"
                  value={dateFrom || ''}
                  max={dateTo || undefined}
                  onChange={(event) => onDateFromChange?.(event.target.value)}
                  aria-label="من تاريخ"
                  aria-invalid={invalidDateRange}
                />
              </label>
            )}

            {hasDateFilter && (
              <label className="flex min-w-0 flex-col gap-1.5 text-[11px] font-bold text-slate-400">
                <span>إلى تاريخ</span>
                <Input
                  type="date"
                  value={dateTo || ''}
                  min={dateFrom || undefined}
                  onChange={(event) => onDateToChange?.(event.target.value)}
                  aria-label="إلى تاريخ"
                  aria-invalid={invalidDateRange}
                />
              </label>
            )}
          </div>
        </div>
      )}

      {invalidDateRange && (
        <p className="text-[11px] font-semibold text-rose-400" role="alert">
          تاريخ البداية يجب أن يكون قبل تاريخ النهاية أو مساويًا له.
        </p>
      )}

      {/* Bottom Summary & Clear */}
      <div className="flex flex-col gap-2 border-t border-slate-800/80 pt-2.5 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <div>
          المعروض: <strong className="font-mono text-cyan-300">{resultCount}</strong> {resultLabel}
          {typeof totalCount === 'number' && totalCount !== resultCount && (
            <span className="mr-2 text-slate-500">من أصل {totalCount}</span>
          )}
        </div>
        {hasActiveFilters && onClear && (
          <Button type="button" variant="ghost" size="sm" onClick={onClear} className="text-cyan-300 hover:text-cyan-100">
            مسح كل الفلاتر
          </Button>
        )}
      </div>
    </Card>
  );
};

export default TableFilterBar;
