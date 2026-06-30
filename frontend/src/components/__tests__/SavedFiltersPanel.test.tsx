import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SavedFiltersPanel from '../SavedFiltersPanel'
import useSavedFilters from '../../stores/useSavedFilters'

describe('SavedFiltersPanel', () => {
  beforeEach(() => {
    localStorage.removeItem('notify-chain-saved-filters')
    const { setState } = useSavedFilters as any
    if (setState) setState({ filters: [] })
  })

  it('saves a filter and applies it', async () => {
    const mockApply = vi.fn()
    render(<SavedFiltersPanel currentFilter={{ q: 'x' }} onApply={mockApply} />)

    const input = screen.getByTestId('save-input') as HTMLInputElement
    const saveBtn = screen.getByTestId('save-button')

    fireEvent.change(input, { target: { value: 'My Filter' } })
    fireEvent.click(saveBtn)

    await waitFor(() => expect(mockApply).toHaveBeenCalled())

    const list = screen.getByTestId('filters-list')
    expect(list.textContent).toContain('My Filter')
  })

  it('renames and deletes a filter', async () => {
    const saved = useSavedFilters.getState().saveFilter({ name: 'ToRename', query: {} })
    const mockApply = vi.fn()
    render(<SavedFiltersPanel currentFilter={{}} onApply={mockApply} />)

    const renameBtn = screen.getByTestId(`rename-${saved.id}`)
    fireEvent.click(renameBtn)

    const renameInput = screen.getByTestId(`rename-input-${saved.id}`) as HTMLInputElement
    fireEvent.change(renameInput, { target: { value: 'Renamed' } })

    const saveRename = screen.getByTestId(`rename-save-${saved.id}`)
    fireEvent.click(saveRename)

    await waitFor(() => expect(screen.getByTestId('filters-list').textContent).toContain('Renamed'))

    const del = screen.getByTestId(`delete-${saved.id}`)
    fireEvent.click(del)

    await waitFor(() => expect(screen.getByTestId('filters-list').textContent).not.toContain('Renamed'))
  })
})
