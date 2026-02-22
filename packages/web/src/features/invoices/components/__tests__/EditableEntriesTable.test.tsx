import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  EditableEntriesTable,
  getCellValue,
  groupToTsv,
  isTsvText,
  parseTsv,
  groupEntries,
  buildGlobalRowMap,
} from '../EditableEntriesTable';
import type { EntryRow, SelectionProps, SectionRowMap } from '../EditableEntriesTable';

/* ------------------------------------------------------------------ */
/*  Test helpers                                                       */
/* ------------------------------------------------------------------ */

const HEADER_FIELD_COUNT = 9;

function makeSelectionProps(): SelectionProps {
  return {
    selection: null,
    range: null,
    isDragging: false,
    handleCellMouseDown: vi.fn(),
    clearSelection: vi.fn(),
    selectRange: vi.fn(),
  };
}

function makeRowMap(entries: EntryRow[]): SectionRowMap {
  const { groups, summaryEntries } = groupEntries(entries);
  return buildGlobalRowMap(HEADER_FIELD_COUNT, groups, summaryEntries.length);
}

/* ------------------------------------------------------------------ */
/*  Pure helper function tests                                        */
/* ------------------------------------------------------------------ */

describe('getCellValue', () => {
  const columns = [
    { key: 'unit', label: 'Unit' },
    { key: 'unit_amount', label: 'Qty' },
  ];

  it('returns label for col 0', () => {
    const entry = { label: 'Widget', amount: 10, entry_type: 'charge' };
    expect(getCellValue(entry, 0, columns)).toBe('Widget');
  });

  it('returns amount as string for col 1', () => {
    const entry = { label: 'Widget', amount: 42.5, entry_type: 'charge' };
    expect(getCellValue(entry, 1, columns)).toBe('42.5');
  });

  it('returns empty string for null amount', () => {
    const entry = { label: 'Widget', amount: null, entry_type: 'charge' };
    expect(getCellValue(entry, 1, columns)).toBe('');
  });

  it('returns attr value for col >= 2', () => {
    const entry = {
      label: 'Widget',
      amount: 10,
      entry_type: 'charge',
      attrs: { unit: 'kg', unit_amount: 5 },
    };
    expect(getCellValue(entry, 2, columns)).toBe('kg');
    expect(getCellValue(entry, 3, columns)).toBe('5');
  });

  it('returns empty string for missing attr', () => {
    const entry = { label: 'Widget', amount: 10, entry_type: 'charge', attrs: {} };
    expect(getCellValue(entry, 2, columns)).toBe('');
  });

  it('returns empty string for out-of-range column', () => {
    const entry = { label: 'Widget', amount: 10, entry_type: 'charge' };
    expect(getCellValue(entry, 99, columns)).toBe('');
  });
});

describe('groupToTsv', () => {
  it('builds TSV with header and data rows', () => {
    const columns = [{ key: 'unit', label: 'Unit' }];
    const entries = [
      { entry: { label: 'Item A', amount: 100, entry_type: 'charge', attrs: { unit: 'ea' } }, globalIndex: 0 },
      { entry: { label: 'Item B', amount: 200, entry_type: 'charge', attrs: { unit: 'kg' } }, globalIndex: 1 },
    ];

    const tsv = groupToTsv(entries, columns);
    const lines = tsv.split('\n');

    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('Entry\tAmount\tUnit');
    expect(lines[1]).toBe('Item A\t100\tea');
    expect(lines[2]).toBe('Item B\t200\tkg');
  });

  it('handles entries with no attrs columns', () => {
    const entries = [
      { entry: { label: 'Simple', amount: 50, entry_type: 'charge' }, globalIndex: 0 },
    ];

    const tsv = groupToTsv(entries, []);
    const lines = tsv.split('\n');

    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('Entry\tAmount');
    expect(lines[1]).toBe('Simple\t50');
  });

  it('handles null amounts', () => {
    const entries = [
      { entry: { label: 'No amount', amount: null, entry_type: 'charge' }, globalIndex: 0 },
    ];

    const tsv = groupToTsv(entries, []);
    expect(tsv).toBe('Entry\tAmount\nNo amount\t');
  });
});

describe('isTsvText', () => {
  it('returns true for text with tabs', () => {
    expect(isTsvText('a\tb\tc')).toBe(true);
  });

  it('returns false for plain text', () => {
    expect(isTsvText('hello world')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isTsvText('')).toBe(false);
  });
});

describe('parseTsv', () => {
  it('parses tab-separated rows', () => {
    const result = parseTsv('a\tb\nc\td');
    expect(result).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('handles Windows line endings', () => {
    const result = parseTsv('a\tb\r\nc\td\r\n');
    expect(result).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('filters empty lines', () => {
    const result = parseTsv('a\tb\n\nc\td\n');
    expect(result).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('returns single-cell rows for lines without tabs', () => {
    const result = parseTsv('hello\nworld');
    expect(result).toEqual([['hello'], ['world']]);
  });
});

/* ------------------------------------------------------------------ */
/*  Component rendering tests                                         */
/* ------------------------------------------------------------------ */

describe('EditableEntriesTable', () => {
  const baseEntries: EntryRow[] = [
    { label: 'Widget A', amount: 100, entry_type: 'charge', attrs: { unit: 'ea', unit_amount: 2 } },
    { label: 'Widget B', amount: 200, entry_type: 'charge', attrs: { unit: 'kg', unit_amount: 5 } },
    { label: 'Subtotal', amount: 300, entry_type: 'subtotal' },
  ];

  it('renders entries in group tables', () => {
    const onChange = vi.fn();
    const { getByDisplayValue } = render(
      <EditableEntriesTable entries={baseEntries} onChange={onChange} selectionProps={makeSelectionProps()} rowMap={makeRowMap(baseEntries)} />
    );

    expect(getByDisplayValue('Widget A')).toBeTruthy();
    expect(getByDisplayValue('Widget B')).toBeTruthy();
  });

  it('renders the Copy button for each group', () => {
    const onChange = vi.fn();
    const { container } = render(
      <EditableEntriesTable entries={baseEntries} onChange={onChange} selectionProps={makeSelectionProps()} rowMap={makeRowMap(baseEntries)} />
    );

    const copyButtons = container.querySelectorAll('button[title="Copy table as TSV (for pasting into Excel)"]');
    expect(copyButtons.length).toBe(1);
  });

  it('renders Copy button for each distinct group', () => {
    const entries: EntryRow[] = [
      { label: 'Item A', amount: 10, entry_type: 'charge' },
      { label: 'Service X', amount: 50, entry_type: 'service' },
    ];
    const onChange = vi.fn();
    const { container } = render(
      <EditableEntriesTable entries={entries} onChange={onChange} selectionProps={makeSelectionProps()} rowMap={makeRowMap(entries)} />
    );

    const copyButtons = container.querySelectorAll('button[title="Copy table as TSV (for pasting into Excel)"]');
    expect(copyButtons.length).toBe(2);
  });

  it('renders summary entries separately', () => {
    const onChange = vi.fn();
    const { container } = render(
      <EditableEntriesTable entries={baseEntries} onChange={onChange} selectionProps={makeSelectionProps()} rowMap={makeRowMap(baseEntries)} />
    );

    const summarySection = container.querySelector('.border-t-2');
    expect(summarySection).toBeTruthy();
    const labelInputs = summarySection!.querySelectorAll('input[placeholder="Label"]');
    expect(labelInputs.length).toBe(1);
    expect((labelInputs[0] as HTMLInputElement).value).toBe('Subtotal');
  });

  it('shows "No entries" when entries array is empty', () => {
    const entries: EntryRow[] = [];
    const onChange = vi.fn();
    const { getByText } = render(
      <EditableEntriesTable entries={entries} onChange={onChange} selectionProps={makeSelectionProps()} rowMap={makeRowMap(entries)} />
    );

    expect(getByText('No entries')).toBeTruthy();
  });

  it('renders data-row and data-col attributes on inputs', () => {
    const entries: EntryRow[] = [
      { label: 'Item A', amount: 10, entry_type: 'charge', attrs: { unit: 'ea' } },
    ];
    const onChange = vi.fn();
    const { container } = render(
      <EditableEntriesTable entries={entries} onChange={onChange} selectionProps={makeSelectionProps()} rowMap={makeRowMap(entries)} />
    );

    const inputs = container.querySelectorAll('input[data-row][data-col]');
    // label (col=0), amount (col=1), unit (col=2) = 3 inputs
    expect(inputs.length).toBe(3);

    const firstInput = inputs[0] as HTMLInputElement;
    expect(firstInput.getAttribute('data-row')).toBe('0');
    expect(firstInput.getAttribute('data-col')).toBe('0');
  });

  it('highlights active cell on focus', () => {
    const entries: EntryRow[] = [
      { label: 'Item A', amount: 10, entry_type: 'charge' },
    ];
    const onChange = vi.fn();
    const { container } = render(
      <EditableEntriesTable entries={entries} onChange={onChange} selectionProps={makeSelectionProps()} rowMap={makeRowMap(entries)} />
    );

    const labelInput = container.querySelector('input[data-row="0"][data-col="0"]') as HTMLInputElement;
    fireEvent.focus(labelInput);

    // After focus, the input should have the active cell class
    expect(labelInput.className).toContain('border-blue-400');
    expect(labelInput.className).toContain('bg-blue-50');
  });

  it('calls onChange when entry value is edited', () => {
    const entries: EntryRow[] = [
      { label: 'Item A', amount: 10, entry_type: 'charge' },
    ];
    const onChange = vi.fn();
    const { container } = render(
      <EditableEntriesTable entries={entries} onChange={onChange} selectionProps={makeSelectionProps()} rowMap={makeRowMap(entries)} />
    );

    const input = container.querySelector('input[data-row="0"][data-col="0"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.value).toBe('Item A');

    fireEvent.change(input, { target: { value: 'Item B' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    const updatedEntries = onChange.mock.calls[0][0];
    expect(updatedEntries[0].label).toBe('Item B');
  });
});
