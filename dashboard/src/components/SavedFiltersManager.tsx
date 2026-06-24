import { memo, useState } from 'react';
import { useEventStore } from '../store/eventStore';
import { useShallow } from 'zustand/react/shallow';
import type { SavedFilter } from '../types/event';

export const SavedFiltersManager = memo(function SavedFiltersManager() {
  const [isOpen, setIsOpen] = useState(false);
  const [filterName, setFilterName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const savedFilters = useEventStore((state) => state.savedFilters);
  const saveCurrentFilter = useEventStore((state) => state.saveCurrentFilter);
  const loadSavedFilter = useEventStore((state) => state.loadSavedFilter);
  const renameSavedFilter = useEventStore((state) => state.renameSavedFilter);
  const deleteSavedFilter = useEventStore((state) => state.deleteSavedFilter);

  const handleSave = () => {
    if (filterName.trim()) {
      saveCurrentFilter(filterName.trim());
      setFilterName('');
    }
  };

  const handleLoad = (id: string) => {
    loadSavedFilter(id);
    setIsOpen(false);
  };

  const handleStartEdit = (filter: SavedFilter) => {
    setEditingId(filter.id);
    setEditingName(filter.name);
  };

  const handleSaveEdit = () => {
    if (editingId && editingName.trim()) {
      renameSavedFilter(editingId, editingName.trim());
      setEditingId(null);
      setEditingName('');
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this saved filter?')) {
      deleteSavedFilter(id);
      if (editingId === id) {
        setEditingId(null);
        setEditingName('');
      }
    }
  };

  return (
    <div className="saved-filters">
      <div className="saved-filters__header">
        <button
          type="button"
          className="saved-filters__toggle"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
        >
          Saved Filters ({savedFilters.length})
        </button>
      </div>

      {isOpen && (
        <div className="saved-filters__panel">
          <div className="saved-filters__save">
            <input
              type="text"
              placeholder="Filter name"
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              className="saved-filters__input"
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={!filterName.trim()}
              className="saved-filters__save-btn"
            >
              Save Current
            </button>
          </div>

          {savedFilters.length > 0 ? (
            <ul className="saved-filters__list">
              {savedFilters.map((filter) => (
                <li key={filter.id} className="saved-filters__item">
                  {editingId === filter.id ? (
                    <div className="saved-filters__edit">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit();
                          if (e.key === 'Escape') handleCancelEdit();
                        }}
                        className="saved-filters__input"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={handleSaveEdit}
                        className="saved-filters__btn saved-filters__btn--save"
                        title="Save"
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        className="saved-filters__btn saved-filters__btn--cancel"
                        title="Cancel"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="saved-filters__view">
                      <button
                        type="button"
                        onClick={() => handleLoad(filter.id)}
                        className="saved-filters__name"
                      >
                        {filter.name}
                      </button>
                      <div className="saved-filters__actions">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(filter)}
                          className="saved-filters__btn saved-filters__btn--edit"
                          title="Rename"
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(filter.id)}
                          className="saved-filters__btn saved-filters__btn--delete"
                          title="Delete"
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="saved-filters__empty">No saved filters yet</p>
          )}
        </div>
      )}
    </div>
  );
});
