import create from 'zustand'
import { persist } from 'zustand/middleware'

export type NotificationFilter = {
  id: string
  name: string
  query: Record<string, any>
  createdAt: string
  updatedAt?: string
}

type State = {
  filters: NotificationFilter[]
  saveFilter: (filter: Omit<NotificationFilter, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => NotificationFilter
  deleteFilter: (id: string) => void
  renameFilter: (id: string, newName: string) => void
  getFilter: (id: string) => NotificationFilter | undefined
}

// Use Zustand persist middleware to persist to localStorage. This ensures filters
// survive browser sessions. We keep updates optimistic by returning the saved
// filter immediately.
export const useSavedFilters = create<State>(
  persist(
    (set, get) => ({
      filters: [],

      saveFilter: (incoming) => {
        const now = new Date().toISOString()
        const id = incoming.id || `f_${Math.random().toString(36).slice(2, 9)}`
        const filter: NotificationFilter = {
          id,
          name: incoming.name,
          query: incoming.query,
          createdAt: now,
          updatedAt: now,
        }
        // optimistic update
        set((s) => ({ filters: [filter, ...s.filters.filter((f) => f.id !== id)] }))
        return filter
      },

      deleteFilter: (id) => {
        set((s) => ({ filters: s.filters.filter((f) => f.id !== id) }))
      },

      renameFilter: (id, newName) => {
        set((s) => ({
          filters: s.filters.map((f) => (f.id === id ? { ...f, name: newName, updatedAt: new Date().toISOString() } : f)),
        }))
      },

      getFilter: (id) => {
        return get().filters.find((f) => f.id === id)
      },
    }),
    {
      name: 'notify-chain-saved-filters',
      // selective serialization to avoid issues with circular refs
      serialize: (state) => JSON.stringify(state),
    }
  )
)

export default useSavedFilters
