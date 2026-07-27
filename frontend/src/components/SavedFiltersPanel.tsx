import React, { useState } from 'react'
import useSavedFilters, { NotificationFilter } from '../stores/useSavedFilters'

type Props = {
  currentFilter: Record<string, any>
  onApply: (filter: NotificationFilter) => void
}

// A compact component to let users save, delete, rename and select saved filters.
// It uses the `useSavedFilters` store so multiple components stay in sync.
export const SavedFiltersPanel: React.FC<Props> = ({ currentFilter, onApply }) => {
  const filters = useSavedFilters((s) => s.filters)
  const saveFilter = useSavedFilters((s) => s.saveFilter)
  const deleteFilter = useSavedFilters((s) => s.deleteFilter)
  const renameFilter = useSavedFilters((s) => s.renameFilter)

  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const handleSave = () => {
    const saved = saveFilter({ name: name || `Filter ${new Date().toLocaleString()}`, query: currentFilter })
    setName('')
    // apply newly saved filter immediately
    onApply(saved)
  }

  return (
    <div className="p-4 border rounded bg-white shadow-sm">
      <h3 className="font-semibold mb-2">Saved Filters</h3>

      <div className="flex gap-2 mb-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Save current filter as..."
          className="flex-1 border px-2 py-1 rounded"
          data-testid="save-input"
        />
        <button onClick={handleSave} className="px-3 py-1 bg-blue-600 text-white rounded" data-testid="save-button">
          Save
        </button>
      </div>

      <ul className="space-y-2" data-testid="filters-list">
        {filters.length === 0 && <li className="text-sm text-gray-500">No saved filters</li>}
        {filters.map((f) => (
          <li key={f.id} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => onApply(f)}
                className="text-left hover:underline"
                data-testid={`apply-${f.id}`}
              >
                {f.name}
              </button>
              <span className="text-xs text-gray-400">{new Date(f.createdAt).toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2">
              {editingId === f.id ? (
                <>
                  <input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    className="border px-2 py-1 rounded"
                    data-testid={`rename-input-${f.id}`}
                  />
                  <button
                    onClick={() => {
                      renameFilter(f.id, editingName)
                      setEditingId(null)
                    }}
                    className="px-2 py-1 bg-green-600 text-white rounded"
                    data-testid={`rename-save-${f.id}`}
                  >
                    OK
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setEditingId(f.id)
                      setEditingName(f.name)
                    }}
                    className="px-2 py-1 bg-yellow-300 rounded"
                    data-testid={`rename-${f.id}`}
                  >
                    Rename
                  </button>
                  <button
                    onClick={() => deleteFilter(f.id)}
                    className="px-2 py-1 bg-red-600 text-white rounded"
                    data-testid={`delete-${f.id}`}
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default SavedFiltersPanel
