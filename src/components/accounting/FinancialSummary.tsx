import React from 'react';
import { PurchaseOrder } from '../../types/purchaseOrder';
import { formatCleanNumber } from '../../utils/numberFormat';

/**
 * Financial summary for a Purchase Order.
 *
 * Business rule (Phase 2):
 * - Currency: EGP only
 * - Grand الإجمالي = SUM(quantity × unit_price)
 */
export const FinancialSummary: React.FC<{ po: PurchaseOrder }> = ({ po }) => {
  const fmt = (v: string | number) => formatCleanNumber(v);

  return (
    <div className="grid grid-cols-2 gap-y-2.5 gap-x-4 bg-slate-950 border border-slate-850 p-5 rounded-xl text-xs max-w-sm mr-auto shadow-md">
      <div className="col-span-2 border-t border-slate-800 my-1" />

      <span className="text-xs font-bold text-cyan-350">الإجمالي النهائي:</span>
      <span className="font-mono text-base font-bold text-emerald-400 text-left">
        {fmt(po.grand_total)} ج.م
      </span>
    </div>
  );
};

export default FinancialSummary;
