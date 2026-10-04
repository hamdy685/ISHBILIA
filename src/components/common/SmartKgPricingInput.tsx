import React, { useState } from 'react';
import { formatCleanNumber } from '../../utils/numberFormat';

export const isKgUnit = (uom?: string | null): boolean => {
  if (!uom) return false;
  const normalized = uom.trim().toUpperCase();
  return (
    ['KG', 'KILOGRAM', 'كجم', 'كيلو', 'كيلوجرام', 'كيلو جرام', 'كيلوغرام'].includes(normalized) ||
    uom.includes('كيلو') ||
    uom.includes('كجم')
  );
};

export const isRebarOrKanat = (description?: string | null): boolean => {
  if (!description) return false;
  const d = description.trim();
  return d.includes('كانات') || d.includes('حديد') || d.includes('أشاير') || d.includes('تسليح');
};

interface SmartKgPricingInputProps {
  unitPrice: number | string;
  quantity: number | string;
  uom?: string | null;
  itemDescription?: string | null;
  onChangeUnitPrice: (newPrice: number) => void;
  onConvertToTon?: (newQty: number, tonPrice: number) => void;
  onConvertToKgPrice?: (newKgPrice: number) => void;
  disabled?: boolean;
  inputClassName?: string;
  idPrefix?: string;
}

export const SmartKgPricingInput: React.FC<SmartKgPricingInputProps> = ({
  unitPrice,
  quantity,
  uom,
  itemDescription,
  onChangeUnitPrice,
  onConvertToTon,
  onConvertToKgPrice,
  disabled = false,
  inputClassName = '',
  idPrefix = 'smart-price',
}) => {
  const isKg = isKgUnit(uom) || (isRebarOrKanat(itemDescription) && !['TON', 'طن'].includes((uom || '').toUpperCase()));
  const numPrice = Number(unitPrice) || 0;
  const numQty = Number(quantity) || 0;

  // Pricing mode: 'KG' (سعر الكيلو) vs 'TON' (سعر الطن)
  const [pricingMode, setPricingMode] = useState<'KG' | 'TON'>('KG');

  // Trigger alert if in KG mode, unit is KG/rebar, and entered price is suspicious (> 500 EGP)
  const isSuspiciousTonPrice = isKg && pricingMode === 'KG' && numPrice >= 500;

  const handleToggleMode = (mode: 'KG' | 'TON') => {
    setPricingMode(mode);
    if (mode === 'TON' && numPrice > 0 && numPrice < 500) {
      // User switched from kg price (e.g. 41.5) to ton price -> multiply by 1000
      onChangeUnitPrice(Math.round(numPrice * 1000 * 100) / 100);
    } else if (mode === 'KG' && numPrice >= 500) {
      // User switched from ton price (e.g. 41500) to kg price -> divide by 1000
      onChangeUnitPrice(Math.round((numPrice / 1000) * 100) / 100);
    }
  };

  const handleApplyConvertToTon = () => {
    const tonQty = Math.round((numQty / 1000) * 1000) / 1000;
    const tonPrice = numPrice;
    if (onConvertToTon) {
      onConvertToTon(tonQty, tonPrice);
    } else {
      onChangeUnitPrice(tonPrice);
    }
  };

  const handleApplyConvertToKgPrice = () => {
    const kgPrice = Math.round((numPrice / 1000) * 100) / 100;
    if (onConvertToKgPrice) {
      onConvertToKgPrice(kgPrice);
    } else {
      onChangeUnitPrice(kgPrice);
    }
  };

  return (
    <div className="space-y-1.5 w-full">
      {/* ── الحل (أ): زر تبديل ذكي [سعر الطن / سعر الكيلو] ── */}
      {isKg && (
        <div className="flex items-center justify-between gap-1 text-[10px] pb-0.5">
          <span className="text-slate-400 font-medium">تسعير بـ:</span>
          <div className="inline-flex items-center rounded-md border border-slate-700 bg-slate-950 p-0.5 shadow-inner">
            <button
              type="button"
              onClick={() => handleToggleMode('TON')}
              disabled={disabled}
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all ${
                pricingMode === 'TON'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="إدخال سعر الطن مباشرة (مثال: 41,500 ج.م)"
            >
              🏷️ سعر الطن
            </button>
            <button
              type="button"
              onClick={() => handleToggleMode('KG')}
              disabled={disabled}
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all ${
                pricingMode === 'KG'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="إدخال سعر الكيلو جرام مباشرة (مثال: 41.50 ج.م)"
            >
              ⚖️ سعر الكيلو
            </button>
          </div>
        </div>
      )}

      {/* ── Input Box ── */}
      <div className="flex items-center justify-center gap-1">
        <input
          id={`${idPrefix}-price-input`}
          aria-label="سعر الوحدة"
          type="number"
          min="0"
          step="any"
          value={unitPrice === 0 || unitPrice === '' ? '' : unitPrice}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            const val = e.target.value === '' ? 0 : Number(e.target.value);
            onChangeUnitPrice(val);
          }}
          disabled={disabled}
          placeholder={pricingMode === 'TON' ? 'سعر الطن (ج.م)' : 'سعر الكيلو (ج.م)'}
          className={
            inputClassName ||
            'h-9 w-28 rounded-md border border-emerald-500/60 bg-[#0b1424] px-2 text-center font-mono text-xs text-slate-100 outline-none focus:border-emerald-300 disabled:opacity-60'
          }
        />
        <span className="text-[10px] text-slate-400 font-bold shrink-0">
          {pricingMode === 'TON' ? 'ج.م/طن' : 'ج.م'}
        </span>
      </div>

      {/* Subtitle helper when in TON mode */}
      {isKg && pricingMode === 'TON' && numPrice > 0 && (
        <div className="text-[10px] font-mono text-cyan-300 bg-cyan-950/40 border border-cyan-800/40 rounded px-1.5 py-0.5 text-center">
          = {formatCleanNumber(numPrice / 1000, 2)} ج.م / كجم
        </div>
      )}

      {/* ── الحل (ج): تنبيه ذكي وتصحيح تلقائي (Smart Validation) ── */}
      {isSuspiciousTonPrice && (
        <div
          role="alert"
          className="mt-1 p-2 rounded-lg border border-amber-500/80 bg-amber-950/60 text-amber-200 text-xs shadow-lg animate-fade-in space-y-1.5 text-right z-10"
          dir="rtl"
        >
          <div className="flex items-center gap-1.5 font-bold text-amber-300 text-[11px]">
            <span>⚠️</span>
            <span>
              يبدو أنك أدخلت سعر الطن ({formatCleanNumber(numPrice)} ج.م) بدلاً من سعر الكيلو!
            </span>
          </div>

          <p className="text-[10px] text-slate-300 leading-tight">
            الكمية: <span className="font-mono font-bold text-amber-200">{numQty} كجم</span> • السعر المدخل:{' '}
            <span className="font-mono font-bold text-amber-200">{formatCleanNumber(numPrice)} ج.م</span>
          </p>

          <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
            <button
              type="button"
              onClick={handleApplyConvertToTon}
              className="px-2 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[10px] transition-colors shadow flex items-center gap-1"
              title="تحويل الكمية والوحدة إلى طن مع إبقاء سعر الطن كما هو"
            >
              <span>🔄</span>
              <span>تحويل الكمية لطن ({formatCleanNumber(numQty / 1000, 3)} طن)</span>
            </button>

            <button
              type="button"
              onClick={handleApplyConvertToKgPrice}
              className="px-2 py-1 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-[10px] transition-colors shadow flex items-center gap-1"
              title="قسمة السعر على 1000 ليصبح سعر الكيلوجرام"
            >
              <span>➗</span>
              <span>حساب سعر الكيلو ({formatCleanNumber(numPrice / 1000, 2)} ج.م)</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
