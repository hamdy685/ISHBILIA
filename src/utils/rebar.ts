import { formatCleanNumber, formatCleanQty } from './numberFormat';

export interface RebarSpec {
  code: string;
  label: string;
  linia: string;
  weightKg: number;
}

export const REBAR_TYPES: Record<string, RebarSpec> = {
  BAR_2_5LINIA: {
    code: 'BAR_2_5LINIA',
    label: 'سيخ 2.5 لينية',
    linia: '2.5 لينية',
    weightKg: 4.7,
  },
  BAR_3LINIA: {
    code: 'BAR_3LINIA',
    label: 'سيخ 3 لينية',
    linia: '3 لينية',
    weightKg: 7.4,
  },
  BAR_4LINIA: {
    code: 'BAR_4LINIA',
    label: 'سيخ 4 لينية',
    linia: '4 لينية',
    weightKg: 10.4,
  },
  BAR_5LINIA: {
    code: 'BAR_5LINIA',
    label: 'سيخ 5 لينية',
    linia: '5 لينية',
    weightKg: 19.0,
  },
  PARCEL: {
    code: 'PARCEL',
    label: 'طرد حديد',
    linia: 'طرد (1.940 طن)',
    weightKg: 1940.0,
  },
};

export const normalizeRebarCode = (unit?: string | null): string => {
  const u = (unit || '').trim().toUpperCase();
  if (u.includes('2.5') || u.includes('2_5') || u.includes('2,5') || u.includes('8 مم') || u.includes('8MM')) return 'BAR_2_5LINIA';
  if ((u.includes('3') && (u.includes('LINIA') || u.includes('MM') || u.includes('لينية') || u.includes('لنية') || u.includes('ملل'))) || u.includes('10 مم') || u.includes('10MM')) return 'BAR_3LINIA';
  if ((u.includes('4') && (u.includes('LINIA') || u.includes('MM') || u.includes('لينية') || u.includes('لنية') || u.includes('ملل'))) || u.includes('12 مم') || u.includes('12MM')) return 'BAR_4LINIA';
  if ((u.includes('5') && (u.includes('LINIA') || u.includes('MM') || u.includes('لينية') || u.includes('لنية') || u.includes('ملل'))) || u.includes('16 مم') || u.includes('16MM')) return 'BAR_5LINIA';
  if (u === 'PARCEL' || u.includes('طرد')) return 'PARCEL';
  return u;
};

export const isRebarUnit = (unit?: string | null): boolean => {
  if (!unit) return false;
  const code = normalizeRebarCode(unit);
  return Boolean(REBAR_TYPES[code]);
};

export const getRebarType = (unit?: string | null): RebarSpec | null => {
  if (!unit) return null;
  const code = normalizeRebarCode(unit);
  return REBAR_TYPES[code] || null;
};

/**
 * Calculates weight in tons for a given number of steel bars.
 * Formula: (barCount * weightPerBar) / 1000
 */
export const calculateRebarTons = (
  barCount: number | string,
  unit?: string | null
): number => {
  const spec = getRebarType(unit);
  if (!spec) return 0;
  const count = typeof barCount === 'string' ? parseFloat(barCount) || 0 : Number(barCount) || 0;
  if (count <= 0) return 0;
  const tons = (count * spec.weightKg) / 1000;
  return Math.round(tons * 1000) / 1000;
};

/**
 * Extracts rebar count and type from specifications string, e.g. "100 سيخ 4 لينية"
 */
export const extractRebarInfo = (
  text?: string | null
): { barCount: number; linia: string; raw: string } | null => {
  if (!text) return null;
  const match = text.match(/(\d+(?:\.\d+)?)\s*سيخ\s*(?:حديد\s*)?(3|4|5)?\s*(?:لينية|لنية|ملل)?/i);
  if (match) {
    return {
      barCount: parseFloat(match[1]) || 0,
      linia: match[2] ? `${match[2]} لينية` : '',
      raw: match[0],
    };
  }
  return null;
};

/**
 * Format quantity and unit for display:
 * If the item is rebar (or converted to TON with bar count in specs),
 * returns e.g. "1.04 طن (100 سيخ 4 لينية)".
 * Otherwise returns null so the caller can fall back to standard formatting.
 */
export const formatRebarDisplay = (
  quantity: number | string,
  unit?: string | null,
  specifications?: string | null
): string | null => {
  const numQty = typeof quantity === 'string' ? parseFloat(quantity) || 0 : Number(quantity) || 0;
  if (numQty <= 0) return null;

  // Case 1: Unit is one of the rebar units (BAR_2_5LINIA, BAR_3LINIA, BAR_4LINIA, BAR_5LINIA, PARCEL)
  if (isRebarUnit(unit)) {
    const spec = getRebarType(unit)!;
    const tons = calculateRebarTons(numQty, unit);
    if (spec.code === 'PARCEL') {
      return `${formatCleanNumber(tons, 3)} طن (${formatCleanQty(numQty)} طرد)`;
    }
    return `${formatCleanNumber(tons, 3)} طن (${formatCleanQty(numQty)} سيخ ${spec.linia})`;
  }

  // Case 2: Unit is TON, check if specifications or description contain rebar linia or info
  const u = (unit || '').trim().toUpperCase();
  if ((u === 'TON' || u === 'طن') && specifications) {
    const info = extractRebarInfo(specifications);
    const spec = getRebarType(info?.linia || specifications);

    if (spec && spec.weightKg > 0 && spec.code !== 'PARCEL') {
      // Calculate realistic bar count for the actual tons
      const calculatedBars = Math.round((numQty * 1000) / spec.weightKg);
      if (calculatedBars > 0) {
        return `${formatCleanNumber(numQty, 3)} طن (${formatCleanQty(calculatedBars)} سيخ ${spec.linia})`;
      }
    } else if (info && info.barCount > 0) {
      // If no specific weight was found, only show static barCount if mathematically plausible
      const kgPerBar = (numQty * 1000) / info.barCount;
      if (kgPerBar >= 3.5 && kgPerBar <= 30) {
        const liniaText = info.linia ? ` ${info.linia}` : '';
        return `${formatCleanNumber(numQty, 3)} طن (${formatCleanQty(info.barCount)} سيخ${liniaText})`;
      } else {
        // Obvious mismatch (e.g. 80 tons with static note): do not display absurd static bar count!
        return `${formatCleanNumber(numQty, 3)} طن`;
      }
    }
  }

  return null;
};

export default {
  REBAR_TYPES,
  isRebarUnit,
  getRebarType,
  calculateRebarTons,
  extractRebarInfo,
  formatRebarDisplay,
};
