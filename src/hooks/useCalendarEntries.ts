import { useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';
import {
  getAllEntries,
  addEntry as addEntryRaw,
  removeEntry as removeEntryRaw,
} from '../services/storage';
import type { CalendarEntry } from '../types';

/**
 * Хук для работы с записями календаря с реактивным состоянием.
 */
export function useCalendarEntries() {
  const [entries, setEntries] = useLocalStorage<CalendarEntry[]>('dp:calendar:entries', []);

  const reload = useCallback(() => {
    setEntries(getAllEntries());
  }, [setEntries]);

  const addEntry = useCallback(
    (dateKey: string, text: string) => {
      const created = addEntryRaw(dateKey, text);
      setEntries((prev) => [...prev, created]);
      return created;
    },
    [setEntries]
  );

  const removeEntry = useCallback(
    (id: string) => {
      removeEntryRaw(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    },
    [setEntries]
  );

  return { entries, addEntry, removeEntry, reload };
}
