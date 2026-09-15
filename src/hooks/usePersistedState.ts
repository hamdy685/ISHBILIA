import { Dispatch, SetStateAction, useEffect, useState } from 'react';

const readStoredValue = <T,>(key: string, initialValue: T | (() => T)): T => {
  try {
    const stored = window.sessionStorage.getItem(key);
    if (stored !== null) {
      return JSON.parse(stored) as T;
    }
    return typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue;
  } catch {
    return typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue;
  }
};

/** يحفظ حالة واجهة مؤقتة مثل الفلاتر دون حفظ بيانات حساسة أو تغيير بيانات الخادم. */
export const usePersistedState = <T,>(key: string, initialValue: T | (() => T)): [T, Dispatch<SetStateAction<T>>] => {
  const [value, setValue] = useState<T>(() => readStoredValue(key, initialValue));

  useEffect(() => {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // التخزين المحلي تحسين اختياري؛ لا يمنع استخدام النظام عند امتلاء التخزين.
    }
  }, [key, value]);

  return [value, setValue];
};

export default usePersistedState;
