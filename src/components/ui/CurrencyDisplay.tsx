import React from 'react';

import { formatCleanNumber } from '../../utils/numberFormat';

export interface CurrencyDisplayProps {
  amount: number | string;
  currency?: string;
  className?: string;
  amountClassName?: string;
  currencyClassName?: string;
}

export const CurrencyDisplay: React.FC<CurrencyDisplayProps> = ({
  amount,
  currency = 'ج.م',
  className = '',
  amountClassName = 'font-bold text-slate-100',
  currencyClassName = 'text-[11px] font-semibold text-cyan-400 mr-1',
}) => {
  const formatted = formatCleanNumber(amount, 2);

  return (
    <span className={`inline-flex items-baseline font-mono dir-ltr ${className}`}>
      <span className={amountClassName}>{formatted}</span>
      <span className={currencyClassName}>{currency}</span>
    </span>
  );
};
