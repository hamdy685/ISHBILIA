<?php

namespace App\Support;

class DecimalHelper
{
    /**
     * Format a decimal number cleanly without trailing zeros and without rounding prematurely.
     * Preserves exact decimal precision for values like 1.165, 1.164, 1.155, 1.125, 10.005, 0.001, 100.000.
     */
    public static function formatCleanDecimal(mixed $val, int $maxDecimals = 4): string
    {
        if ($val === null || $val === '') {
            return '0';
        }

        $num = (float) $val;
        if (is_nan($num)) {
            return '0';
        }

        $str = number_format($num, $maxDecimals, '.', '');
        if (str_contains($str, '.')) {
            $str = rtrim(rtrim($str, '0'), '.');
        }

        return $str === '' ? '0' : $str;
    }
}
