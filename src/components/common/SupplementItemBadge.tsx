import React from 'react';

interface SupplementItemBadgeProps {
  isSupplementary?: boolean | null;
  batchNumber?: number | string | null;
  className?: string;
  size?: 'sm' | 'md';
}

export const SupplementItemBadge: React.FC<SupplementItemBadgeProps> = ({
  isSupplementary,
  batchNumber,
  className = '',
  size = 'sm',
}) => {
  if (!isSupplementary) return null;

  const sizeClasses =
    size === 'sm'
      ? 'px-2 py-0.5 text-[11px]'
      : 'px-2.5 py-1 text-xs sm:text-sm';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg font-black bg-gradient-to-r from-amber-500/25 via-amber-500/15 to-amber-600/20 text-amber-300 border border-amber-500/60 shadow-sm shadow-amber-950/40 select-none print:bg-amber-100 print:text-amber-900 print:border-amber-400 ${sizeClasses} ${className}`}
      title={`بند كمالة إلحاقي (دفعة #${batchNumber || 1})`}
    >
      <span className="text-amber-400 text-xs leading-none">➕</span>
      <span>بند كمالة{batchNumber ? ` (دفعة #${batchNumber})` : ''}</span>
    </span>
  );
};

export default SupplementItemBadge;
