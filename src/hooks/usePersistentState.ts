import { useEffect, useState } from 'react';

type Updater<T> = T | ((previous: T) => T);

const readStoredValue = <T,>(key: string, initialValue: T): T => {
  if (typeof window === 'undefined') {
    return initialValue;
  }

  try {
    const storedValue = window.sessionStorage.getItem(key);
    if (storedValue === null) {
      return initialValue;
    }

    return JSON.parse(storedValue) as T;
  } catch (error) {
    console.warn(`[usePersistentState] Não foi possível ler ${key}:`, error);
    return initialValue;
  }
};

export const usePersistentState = <T,>(key: string, initialValue: T) => {
  const [value, setValue] = useState<T>(() => readStoredValue(key, initialValue));

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn(`[usePersistentState] Não foi possível salvar ${key}:`, error);
    }
  }, [key, value]);

  const updateValue = (nextValue: Updater<T>) => {
    setValue((previousValue) =>
      typeof nextValue === 'function'
        ? (nextValue as (previous: T) => T)(previousValue)
        : nextValue
    );
  };

  return [value, updateValue] as const;
};
