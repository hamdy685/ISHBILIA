import React, { useState, useRef, useEffect, useMemo } from 'react';

export interface ArabicDatePickerProps {
  value: string; // ISO format: 'YYYY-MM-DD'
  onChange: (val: string) => void; // Emits ISO: 'YYYY-MM-DD'
  label?: string;
  className?: string;
  minYear?: number;
  maxYear?: number;
  highlightToday?: boolean;
}

export const MONTHS_AR = [
  { num: 1, name: 'يناير', days: 31 },
  { num: 2, name: 'فبراير', days: 28 }, // dynamic in leap
  { num: 3, name: 'مارس', days: 31 },
  { num: 4, name: 'أبريل', days: 30 },
  { num: 5, name: 'مايو', days: 31 },
  { num: 6, name: 'يونيو', days: 30 },
  { num: 7, name: 'يوليو', days: 31 },
  { num: 8, name: 'أغسطس', days: 31 },
  { num: 9, name: 'سبتمبر', days: 30 },
  { num: 10, name: 'أكتوبر', days: 31 },
  { num: 11, name: 'نوفمبر', days: 30 },
  { num: 12, name: 'ديسمبر', days: 31 },
];

export const getDaysInMonth = (year: number, month: number): number => {
  return new Date(year, month, 0).getDate();
};

export const clampDateToValidMonthDay = (dateStr: string): string => {
  if (!dateStr || dateStr.length < 10) return dateStr;
  const parts = dateStr.slice(0, 10).split('-');
  if (parts.length !== 3) return dateStr;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  let d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return dateStr;
  const max = getDaysInMonth(y, m);
  if (d > max) d = max;
  if (d < 1) d = 1;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

export const formatDateDMY = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '—';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return dateStr;
  const parts = dateStr.slice(0, 10).split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${d}/${m}/${y}`;
  }
  return dateStr;
};

/**
 * ArabicDatePicker:
 * An authentic Arabic DatePicker component that strictly formats and accepts dates in:
 * [اليوم] / [الشهر] / [السنة] (Day / Month / Year - DD/MM/YYYY)
 *
 * Guarantees that months like September (شهر 9) only have 30 days, avoiding impossible dates (like 31/09).
 */
export const ArabicDatePicker: React.FC<ArabicDatePickerProps> = ({
  value,
  onChange,
  label,
  className = '',
  minYear = 2022,
  maxYear = 2032,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse YYYY-MM-DD safely
  const parsed = useMemo(() => {
    const safeStr = clampDateToValidMonthDay(value || new Date().toISOString().slice(0, 10));
    const [yStr, mStr, dStr] = safeStr.split('-');
    const year = parseInt(yStr, 10) || new Date().getFullYear();
    const month = parseInt(mStr, 10) || new Date().getMonth() + 1;
    const maxDays = getDaysInMonth(year, month);
    const day = Math.min(Math.max(parseInt(dStr, 10) || 1, 1), maxDays);
    return { year, month, day, maxDays };
  }, [value]);

  const { year, month, day, maxDays } = parsed;

  // Calendar popover view state
  const [viewYear, setViewYear] = useState(year);
  const [viewMonth, setViewMonth] = useState(month);

  useEffect(() => {
    setViewYear(year);
    setViewMonth(month);
  }, [year, month]);

  // Click outside to close popover
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  const emitNewDate = (newYear: number, newMonth: number, newDay: number) => {
    const validMax = getDaysInMonth(newYear, newMonth);
    const clampedDay = Math.min(Math.max(newDay, 1), validMax);
    const yStr = String(newYear);
    const mStr = String(newMonth).padStart(2, '0');
    const dStr = String(clampedDay).padStart(2, '0');
    onChange(`${yStr}-${mStr}-${dStr}`);
  };

  const handleDaySelect = (newDay: number) => {
    emitNewDate(year, month, newDay);
  };

  const handleMonthSelect = (newMonth: number) => {
    emitNewDate(year, newMonth, day);
  };

  const handleYearSelect = (newYear: number) => {
    emitNewDate(newYear, month, day);
  };

  // Days list for currently selected month
  const daysList = useMemo(() => {
    const list: number[] = [];
    for (let i = 1; i <= maxDays; i++) {
      list.push(i);
    }
    return list;
  }, [maxDays]);

  // Years list
  const yearsList = useMemo(() => {
    const list: number[] = [];
    for (let y = minYear; y <= maxYear; y++) {
      list.push(y);
    }
    return list;
  }, [minYear, maxYear]);

  // Calendar days grid calculation (Saturday to Friday in Arabic calendar)
  const calendarGrid = useMemo(() => {
    const daysInViewMonth = getDaysInMonth(viewYear, viewMonth);
    // JS getDay(): 0 is Sunday, 1 is Monday, ..., 6 is Saturday
    // In Arabic Arab world, week starts Saturday (index 0)
    const firstDayObj = new Date(viewYear, viewMonth - 1, 1);
    const jsDay = firstDayObj.getDay(); // 0: Sun, 1: Mon, ..., 6: Sat
    const arabicOffset = (jsDay + 1) % 7; // Sat: 0, Sun: 1, Mon: 2, Tue: 3, Wed: 4, Thu: 5, Fri: 6

    const cells: (number | null)[] = [];
    for (let i = 0; i < arabicOffset; i++) {
      cells.push(null);
    }
    for (let d = 1; d <= daysInViewMonth; d++) {
      cells.push(d);
    }
    return cells;
  }, [viewYear, viewMonth]);

  const dayOfWeekName = useMemo(() => {
    try {
      const d = new Date(year, month - 1, day);
      return d.toLocaleDateString('ar-EG', { weekday: 'long' });
    } catch {
      return '';
    }
  }, [year, month, day]);

  return (
    <div ref={containerRef} className={`relative inline-flex items-center gap-1.5 ${className}`} dir="rtl">
      {label && <span className="text-[11px] font-bold text-slate-400 select-none">{label}</span>}

      {/* Main Segmented Date Control: Day / Month / Year */}
      <div className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 shadow-sm focus-within:border-emerald-400 transition-colors">
        
        {/* 1. Day Selector (اليوم) */}
        <div className="flex items-center gap-0.5">
          <select
            value={day}
            onChange={(e) => handleDaySelect(parseInt(e.target.value, 10))}
            className="rounded bg-slate-800/80 px-1 py-0.5 font-mono text-xs font-black text-emerald-300 focus:bg-slate-800 focus:outline-none cursor-pointer border border-transparent hover:border-slate-600 transition"
            title="اليوم (DD)"
          >
            {daysList.map((d) => (
              <option key={d} value={d} className="bg-slate-900 text-white font-mono">
                {String(d).padStart(2, '0')}
              </option>
            ))}
          </select>
          <span className="text-[10px] font-bold text-slate-500">يوم</span>
        </div>

        <span className="text-slate-600 font-bold select-none">/</span>

        {/* 2. Month Selector (الشهر) */}
        <div className="flex items-center gap-0.5">
          <select
            value={month}
            onChange={(e) => handleMonthSelect(parseInt(e.target.value, 10))}
            className="rounded bg-slate-800/80 px-1 py-0.5 text-xs font-bold text-slate-200 focus:bg-slate-800 focus:outline-none cursor-pointer border border-transparent hover:border-slate-600 transition"
            title="الشهر (MM)"
          >
            {MONTHS_AR.map((m) => {
              const daysInM = getDaysInMonth(year, m.num);
              return (
                <option key={m.num} value={m.num} className="bg-slate-900 text-white">
                  {String(m.num).padStart(2, '0')} - {m.name} ({daysInM} يوم)
                </option>
              );
            })}
          </select>
          <span className="text-[10px] font-bold text-slate-500">شهر</span>
        </div>

        <span className="text-slate-600 font-bold select-none">/</span>

        {/* 3. Year Selector (السنة) */}
        <div className="flex items-center gap-0.5">
          <select
            value={year}
            onChange={(e) => handleYearSelect(parseInt(e.target.value, 10))}
            className="rounded bg-slate-800/80 px-1 py-0.5 font-mono text-xs font-bold text-slate-300 focus:bg-slate-800 focus:outline-none cursor-pointer border border-transparent hover:border-slate-600 transition"
            title="السنة (YYYY)"
          >
            {yearsList.map((y) => (
              <option key={y} value={y} className="bg-slate-900 text-white font-mono">
                {y}
              </option>
            ))}
          </select>
          <span className="text-[10px] font-bold text-slate-500">سنة</span>
        </div>

        {/* Calendar Picker Toggle Button */}
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className={`mr-1 rounded p-1 text-xs transition hover:bg-slate-800 active:scale-95 ${
            isOpen ? 'text-emerald-400 bg-slate-800' : 'text-slate-400 hover:text-emerald-300'
          }`}
          title={`عرض التقويم الشهري (${dayOfWeekName} ${day}/${month}/${year})`}
        >
          📅
        </button>
      </div>

      {/* Interactive Calendar Popover */}
      {isOpen && (
        <div className="absolute top-full mt-1.5 right-0 z-50 w-72 rounded-xl border border-slate-700 bg-slate-950 p-3 shadow-2xl text-slate-100 animate-in fade-in zoom-in-95 duration-100">
          
          {/* Header with Navigation */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
            <div className="flex items-center gap-1.5 font-bold text-xs">
              <span className="text-emerald-400 font-black">
                {MONTHS_AR[viewMonth - 1]?.name}
              </span>
              <span className="font-mono text-slate-400">
                {viewYear}
              </span>
              <span className="text-[10px] text-slate-500 font-normal">
                ({getDaysInMonth(viewYear, viewMonth)} يوم)
              </span>
            </div>

            <div className="flex items-center gap-1" dir="ltr">
              <button
                type="button"
                onClick={() => {
                  if (viewMonth === 1) {
                    setViewMonth(12);
                    setViewYear((y) => y - 1);
                  } else {
                    setViewMonth((m) => m - 1);
                  }
                }}
                className="h-6 w-6 rounded hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center font-bold text-sm"
                title="الشهر السابق"
              >
                ◀
              </button>
              <button
                type="button"
                onClick={() => {
                  if (viewMonth === 12) {
                    setViewMonth(1);
                    setViewYear((y) => y + 1);
                  } else {
                    setViewMonth((m) => m + 1);
                  }
                }}
                className="h-6 w-6 rounded hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center font-bold text-sm"
                title="الشهر التالي"
              >
                ▶
              </button>
            </div>
          </div>

          {/* Weekday Headers (Sat to Fri) */}
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black text-slate-400 mb-1.5 select-none">
            <span>سبت</span>
            <span>أحد</span>
            <span>إثنين</span>
            <span>ثلاث</span>
            <span>أربع</span>
            <span>خميس</span>
            <span className="text-rose-400">جمعة</span>
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {calendarGrid.map((dNum, idx) => {
              if (dNum === null) {
                return <div key={`empty-${idx}`} className="h-7 w-7" />;
              }

              const isSelected = viewYear === year && viewMonth === month && dNum === day;
              const isFriday = idx % 7 === 6;

              return (
                <button
                  key={`day-${dNum}`}
                  type="button"
                  onClick={() => {
                    emitNewDate(viewYear, viewMonth, dNum);
                    setIsOpen(false);
                  }}
                  className={`h-7 w-7 rounded-lg text-xs font-mono font-bold transition flex items-center justify-center cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-600 text-white shadow-md font-black scale-105'
                      : isFriday
                      ? 'text-rose-300 hover:bg-slate-800'
                      : 'text-slate-200 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {dNum}
                </button>
              );
            })}
          </div>

          {/* Quick Action Presets Footer */}
          <div className="mt-3 pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] font-bold">
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                emitNewDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
                setIsOpen(false);
              }}
              className="text-emerald-400 hover:text-emerald-300 transition"
            >
              اليوم الحالي
            </button>

            <button
              type="button"
              onClick={() => {
                const maxDay = getDaysInMonth(viewYear, viewMonth);
                emitNewDate(viewYear, viewMonth, maxDay);
                setIsOpen(false);
              }}
              className="text-amber-400 hover:text-amber-300 transition"
              title={`نهاية شهر ${MONTHS_AR[viewMonth - 1]?.name} (${getDaysInMonth(viewYear, viewMonth)} يوم)`}
            >
              نهاية الشهر ({getDaysInMonth(viewYear, viewMonth)})
            </button>
          </div>

          {/* Selected Date Summary */}
          <div className="mt-2 text-center text-[10px] text-slate-400 font-mono bg-slate-900/80 rounded py-1 border border-slate-800">
            {dayOfWeekName} • {String(day).padStart(2, '0')}/{String(month).padStart(2, '0')}/{year} (يوم/شهر/سنة)
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * ArabicMonthPicker:
 * A clean Month & Year picker that outputs 'YYYY-MM' with clear Arabic month names & number of days.
 */
export const ArabicMonthPicker: React.FC<{
  value: string; // 'YYYY-MM'
  onChange: (val: string) => void;
  label?: string;
  className?: string;
  minYear?: number;
  maxYear?: number;
}> = ({
  value,
  onChange,
  label = 'الشهر:',
  className = '',
  minYear = 2022,
  maxYear = 2032,
}) => {
  const [yStr, mStr] = (value || new Date().toISOString().slice(0, 7)).split('-');
  const year = parseInt(yStr, 10) || new Date().getFullYear();
  const month = parseInt(mStr, 10) || new Date().getMonth() + 1;

  const yearsList = useMemo(() => {
    const list: number[] = [];
    for (let y = minYear; y <= maxYear; y++) list.push(y);
    return list;
  }, [minYear, maxYear]);

  const handleMonthChange = (newMonth: number) => {
    onChange(`${year}-${String(newMonth).padStart(2, '0')}`);
  };

  const handleYearChange = (newYear: number) => {
    onChange(`${newYear}-${String(month).padStart(2, '0')}`);
  };

  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`} dir="rtl">
      {label && <span className="text-[11px] font-bold text-slate-400 select-none">{label}</span>}
      <div className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 shadow-sm focus-within:border-emerald-400 transition-colors">
        
        {/* Month Selector */}
        <select
          value={month}
          onChange={(e) => handleMonthChange(parseInt(e.target.value, 10))}
          className="rounded bg-slate-800/80 px-1 py-0.5 text-xs font-bold text-slate-200 focus:bg-slate-800 focus:outline-none cursor-pointer border border-transparent hover:border-slate-600 transition"
          title="الشهر (MM)"
        >
          {MONTHS_AR.map((m) => {
            const daysInM = getDaysInMonth(year, m.num);
            return (
              <option key={m.num} value={m.num} className="bg-slate-900 text-white">
                {String(m.num).padStart(2, '0')} - {m.name} ({daysInM} يوم)
              </option>
            );
          })}
        </select>

        <span className="text-slate-600 font-bold select-none">/</span>

        {/* Year Selector */}
        <select
          value={year}
          onChange={(e) => handleYearChange(parseInt(e.target.value, 10))}
          className="rounded bg-slate-800/80 px-1 py-0.5 font-mono text-xs font-bold text-slate-300 focus:bg-slate-800 focus:outline-none cursor-pointer border border-transparent hover:border-slate-600 transition"
          title="السنة (YYYY)"
        >
          {yearsList.map((y) => (
            <option key={y} value={y} className="bg-slate-900 text-white font-mono">
              {y}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default ArabicDatePicker;
