import { beforeEach, describe, expect, it } from 'vitest'
import useSavedFilters from '../useSavedFilters'

describe('useSavedFilters store', () => {
  beforeEach(() => {
    // reset the store state by clearing localStorage key used by the persist middleware
    localStorage.removeItem('notify-chain-saved-filters')
    const { setState } = useSavedFilters as any
    if (setState) setState({ filters: [] })
  })

  it('saves a filter and retrieves it', () => {
    const filter = useSavedFilters.getState().saveFilter({ name: 'Test', query: { a: 1 } })
    expect(filter).toHaveProperty('id')
    const fetched = useSavedFilters.getState().getFilter(filter.id)
    expect(fetched).toBeDefined()
    expect(fetched?.name).toBe('Test')
  })

  it('renames a filter', () => {
    const f = useSavedFilters.getState().saveFilter({ name: 'Old', query: {} })
    useSavedFilters.getState().renameFilter(f.id, 'New')
    const updated = useSavedFilters.getState().getFilter(f.id)
    expect(updated?.name).toBe('New')
  })

  it('deletes a filter', () => {
    const f = useSavedFilters.getState().saveFilter({ name: 'ToDelete', query: {} })
    useSavedFilters.getState().deleteFilter(f.id)
    expect(useSavedFilters.getState().getFilter(f.id)).toBeUndefined()
  })
})
