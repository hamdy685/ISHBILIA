import { describe, it, expect } from 'vitest';
import { formatRebarDisplay, calculateRebarTons, normalizeRebarCode } from './rebar';

describe('Rebar Utilities', () => {
  it('normalizes rebar codes accurately for linia and mm diameter', () => {
    expect(normalizeRebarCode('4 لينية')).toBe('BAR_4LINIA');
    expect(normalizeRebarCode('12 مم')).toBe('BAR_4LINIA');
    expect(normalizeRebarCode('3 لينية')).toBe('BAR_3LINIA');
    expect(normalizeRebarCode('10 مم')).toBe('BAR_3LINIA');
    expect(normalizeRebarCode('5 لينية')).toBe('BAR_5LINIA');
    expect(normalizeRebarCode('16 مم')).toBe('BAR_5LINIA');
    expect(normalizeRebarCode('2.5 لينية')).toBe('BAR_2_5LINIA');
    expect(normalizeRebarCode('8 مم')).toBe('BAR_2_5LINIA');
  });

  it('calculates tons from bar count accurately', () => {
    // 70 bars of 4 linia (10.4 kg/bar) -> 728 kg = 0.728 tons
    expect(calculateRebarTons(70, 'BAR_4LINIA')).toBe(0.728);
    // 100 bars of 3 linia (7.4 kg/bar) -> 740 kg = 0.74 tons
    expect(calculateRebarTons(100, 'BAR_3LINIA')).toBe(0.74);
  });

  it('formats rebar display with mathematical precision and prevents absurd static bar counts', () => {
    // Case A: Quantity in tons with specifications containing 4 linia / 12 mm
    // 80 tons should NEVER claim to be 70 bars! It should calculate 7,692 bars:
    const display80Tons = formatRebarDisplay(80, 'TON', 'حديد 12 مم 4 لينية');
    expect(display80Tons).toContain('80 طن');
    expect(display80Tons).toContain('7,692 سيخ 4 لينية');

    // Case B: 0.728 tons matches 70 bars of 4 linia
    const display0728Tons = formatRebarDisplay(0.728, 'TON', '70 سيخ 4 لينية');
    expect(display0728Tons).toContain('0.728 طن');
    expect(display0728Tons).toContain('70 سيخ 4 لينية');

    // Case C: 6.55 tons of 4 linia -> 6550 / 10.4 = 630 bars
    const display655Tons = formatRebarDisplay(6.55, 'TON', 'حديد 12 مم (4 لينية)');
    expect(display655Tons).toContain('6.55 طن');
    expect(display655Tons).toContain('630 سيخ 4 لينية');

    // Case D: Rebar unit directly
    const displayUnit = formatRebarDisplay(70, 'BAR_4LINIA');
    expect(displayUnit).toBe('0.728 طن (70 سيخ 4 لينية)');
  });
});
