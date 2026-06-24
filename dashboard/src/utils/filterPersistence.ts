import type { SavedFilter } from '../types/event';

const SAVED_FILTERS_KEY = 'notify-chain:saved-filters';

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value) {
      localStorage.setItem(key, value);
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // localStorage may be unavailable (private browsing, etc.)
  }
}

export function getSavedFilters(): SavedFilter[] {
  const data = readStorage(SAVED_FILTERS_KEY);
  if (!data) return [];
  
  try {
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function setSavedFilters(filters: SavedFilter[]): void {
  writeStorage(SAVED_FILTERS_KEY, JSON.stringify(filters));
}

export function addSavedFilter(filter: SavedFilter): SavedFilter[] {
  const existing = getSavedFilters();
  const updated = [...existing, filter];
  setSavedFilters(updated);
  return updated;
}

export function updateSavedFilter(id: string, updates: Partial<SavedFilter>): SavedFilter[] {
  const existing = getSavedFilters();
  const updated = existing.map((filter) =>
    filter.id === id ? { ...filter, ...updates } : filter
  );
  setSavedFilters(updated);
  return updated;
}

export function deleteSavedFilter(id: string): SavedFilter[] {
  const existing = getSavedFilters();
  const updated = existing.filter((filter) => filter.id !== id);
  setSavedFilters(updated);
  return updated;
}
