import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React, { useState } from 'react';
import { ItemAutocompleteInput } from '../components/common/ItemAutocompleteInput';
import * as catalogApi from '../api/catalog';

describe('ItemAutocompleteInput Component (Free Solo & Debounce)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows free typing without restriction (Free Solo mode)', () => {
    const TestComponent = () => {
      const [val, setVal] = useState('');
      return <ItemAutocompleteInput value={val} onChange={setVal} placeholder="ادخل اسم الصنف" />;
    };

    render(<TestComponent />);
    const input = screen.getByPlaceholderText('ادخل اسم الصنف') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'مادة خاصة جديدة 999' } });
    expect(input.value).toBe('مادة خاصة جديدة 999');
  });

  it('fetches suggestions with debounce and displays them in dropdown', async () => {
    const mockSuggestions = ['حديد تسليح 12 مم', 'حديد تسليح 16 مم'];
    vi.spyOn(catalogApi, 'getItemSuggestionsApi').mockResolvedValue(mockSuggestions);

    const handleChange = vi.fn();
    render(
      <ItemAutocompleteInput
        value="حديد"
        onChange={handleChange}
        placeholder="بحث الصنف"
      />
    );

    const input = screen.getByPlaceholderText('بحث الصنف');
    fireEvent.focus(input);

    await waitFor(() => {
      expect(catalogApi.getItemSuggestionsApi).toHaveBeenCalledWith('حديد');
    }, { timeout: 1000 });

    await waitFor(() => {
      expect(screen.getByText(/12 مم/)).toBeInTheDocument();
      expect(screen.getByText(/16 مم/)).toBeInTheDocument();
    });

    // Clicking a suggestion
    const firstSuggestion = screen.getByText(/12 مم/);
    fireEvent.mouseDown(firstSuggestion);

    expect(handleChange).toHaveBeenCalledWith('حديد تسليح 12 مم');
  });

  it('navigates through suggestions with keyboard arrows and selects with Enter', async () => {
    const mockSuggestions = ['أسمنت بورتلاندي عادي', 'أسمنت مقاوم للكبريتات'];
    vi.spyOn(catalogApi, 'getItemSuggestionsApi').mockResolvedValue(mockSuggestions);

    let currentValue = 'أسمنت';
    const handleChange = vi.fn((val) => {
      currentValue = val;
    });

    const { rerender } = render(
      <ItemAutocompleteInput
        value={currentValue}
        onChange={handleChange}
        placeholder="بحث"
      />
    );

    const input = screen.getByPlaceholderText('بحث');
    fireEvent.focus(input);

    await waitFor(() => {
      expect(screen.getByText(/بورتلاندي عادي/)).toBeInTheDocument();
    });

    // Press ArrowDown to highlight the first suggestion
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    // Press Enter to select
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(handleChange).toHaveBeenCalledWith('أسمنت بورتلاندي عادي');
  });
});
