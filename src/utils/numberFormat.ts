/**
 * Centralized Number, Currency, and Quantity formatting utility for Al-Ashbiliya Procurement System.
 * 
 * Rules:
 * 1. Integer / Whole numbers (e.g. 55, 10, 2010, 110050) display WITHOUT decimal point and WITHOUT trailing zeros.
 * 2. Numbers with actual decimal fractions (e.g. 5.5, 12.75) display up to maxDecimals without unnecessary trailing zeros.
 * 3. Uses standard commas for thousands separation (e.g. 110,050).
 */

export const formatCleanNumber = (
  val: number | string | null | undefined,
  maxDecimals = 2
): string => {
  if (val === null || val === undefined || val === '') return '0';
  const num = typeof val === 'string' ? parseFloat(val) : Number(val);
  if (isNaN(num)) return '0';

  return num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  });
};

export const formatCleanCurrency = (
  val: number | string | null | undefined,
  suffix = 'ج.م'
): string => {
  const formatted = formatCleanNumber(val, 2);
  return suffix ? `${formatted} ${suffix}` : formatted;
};

export const formatCleanQty = (
  val: number | string | null | undefined
): string => {
  return formatCleanNumber(val, 3);
};

export default {
  formatCleanNumber,
  formatCleanCurrency,
  formatCleanQty,
};
