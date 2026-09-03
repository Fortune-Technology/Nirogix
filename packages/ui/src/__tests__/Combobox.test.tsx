import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { Combobox, type ComboboxOption } from '../components/Combobox';

/**
 * The searchable field that also accepts free text (ADR-029). What is worth protecting is
 * what `<input list>` + `<datalist>` could not do and what a page would otherwise
 * re-implement per module: the option/free-text distinction the caller stores as a pair,
 * the keyboard contract, the second line, the server-search mode, and the fact that a click
 * on an option is not eaten by the field's own blur.
 */

const DRUGS: ComboboxOption[] = [
  {
    value: 'd1',
    label: 'Amoxicillin 500 mg',
    description: 'Capsule',
    meta: '₹4.00',
    keywords: 'amox antibiotic',
  },
  { value: 'd2', label: 'Paracetamol 650 mg', description: 'Tablet', meta: '₹2.00' },
  { value: 'd3', label: 'Metformin 500 mg', description: 'Tablet', meta: '₹3.50' },
];

/** Mirrors how a page holds this control: the text and the matched record together. */
function Harness(props: Partial<React.ComponentProps<typeof Combobox>> = {}) {
  const [text, setText] = useState(props.value ?? '');
  const [picked, setPicked] = useState<ComboboxOption | null>(null);
  return (
    <>
      <Combobox
        label="Drug"
        options={DRUGS}
        {...props}
        value={text}
        onChange={(t, o) => {
          setText(t);
          setPicked(o);
          props.onChange?.(t, o);
        }}
      />
      <output data-testid="picked">{picked ? picked.value : 'none'}</output>
    </>
  );
}

function field() {
  return screen.getByRole('combobox', { name: 'Drug' });
}

describe('Combobox', () => {
  it('opens on focus and lists every option before anything is typed', () => {
    render(<Harness />);
    fireEvent.focus(field());
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('filters on every term typed, in any order', () => {
    render(<Harness />);
    fireEvent.focus(field());
    fireEvent.change(field(), { target: { value: '500 met' } });
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]!.textContent).toContain('Metformin 500 mg');
  });

  it('matches the keywords a caller adds, not only the label', () => {
    render(<Harness />);
    fireEvent.focus(field());
    fireEvent.change(field(), { target: { value: 'antibiotic' } });
    expect(screen.getAllByRole('option')[0]!.textContent).toContain('Amoxicillin 500 mg');
  });

  it('renders the second line and the right-aligned detail a datalist cannot', () => {
    render(<Harness />);
    fireEvent.focus(field());
    const option = screen.getByRole('option', { name: /Amoxicillin/ });
    expect(within(option).getByText('Capsule')).toBeDefined();
    expect(within(option).getByText('₹4.00')).toBeDefined();
  });

  it("reports the option when one is picked, and null when the text is the user's own", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.focus(field());
    fireEvent.pointerDown(screen.getByRole('option', { name: /Paracetamol/ }));
    expect(onChange).toHaveBeenLastCalledWith(
      'Paracetamol 650 mg',
      expect.objectContaining({ value: 'd2' }),
    );
    expect(screen.getByTestId('picked').textContent).toBe('d2');

    fireEvent.change(field(), { target: { value: 'Ayurvedic syrup' } });
    expect(onChange).toHaveBeenLastCalledWith('Ayurvedic syrup', null);
    expect(screen.getByTestId('picked').textContent).toBe('none');
  });

  it('re-links free text that is typed out to exactly match a master row', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.focus(field());
    fireEvent.change(field(), { target: { value: '  metformin 500 MG ' } });
    expect(onChange).toHaveBeenLastCalledWith(
      '  metformin 500 MG ',
      expect.objectContaining({ value: 'd3' }),
    );
  });

  it('walks the list with the arrow keys and selects with Enter', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.focus(field());
    fireEvent.keyDown(field(), { key: 'ArrowDown' });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith(
      'Paracetamol 650 mg',
      expect.objectContaining({ value: 'd2' }),
    );
  });

  it('wraps from the end of the list back to the start', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.focus(field());
    fireEvent.keyDown(field(), { key: 'End' });
    fireEvent.keyDown(field(), { key: 'ArrowDown' });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith(
      'Amoxicillin 500 mg',
      expect.objectContaining({ value: 'd1' }),
    );
  });

  it('closes on Escape and keeps what was typed', () => {
    render(<Harness />);
    fireEvent.focus(field());
    fireEvent.change(field(), { target: { value: 'Para' } });
    fireEvent.keyDown(field(), { key: 'Escape' });
    expect(screen.queryByRole('option')).toBeNull();
    expect((field() as HTMLInputElement).value).toBe('Para');
  });

  it('skips a disabled option rather than parking the highlight on it', () => {
    const onChange = vi.fn();
    render(
      <Harness
        options={[DRUGS[0]!, { ...DRUGS[1]!, disabled: true }, DRUGS[2]!]}
        onChange={onChange}
      />,
    );
    fireEvent.focus(field());
    fireEvent.keyDown(field(), { key: 'ArrowDown' });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith(
      'Metformin 500 mg',
      expect.objectContaining({ value: 'd3' }),
    );
  });

  /** Same defect as `Select`: a repeated, non-adjacent group name must not collide as a key. */
  it('survives a group name that appears in two non-adjacent runs', () => {
    render(
      <Harness
        options={[
          { value: 'a', label: 'Amoxicillin 500 mg', group: 'Antibiotic' },
          { value: 'p', label: 'Paracetamol 650 mg', group: 'Analgesic' },
          { value: 'c', label: 'Cefixime 200 mg', group: 'Antibiotic' },
        ]}
      />,
    );
    fireEvent.focus(field());
    expect(screen.getAllByRole('option')).toHaveLength(3);

    fireEvent.change(field(), { target: { value: 'cef' } });
    const filtered = screen.getAllByRole('option');
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.textContent).toContain('Cefixime 200 mg');
  });

  it('says it is loading rather than claiming the list is empty', () => {
    render(<Harness options={[]} loading />);
    fireEvent.focus(field());
    expect(screen.getByText('Loading…')).toBeDefined();
    expect(screen.queryByRole('option')).toBeNull();
  });

  it("shows the caller's empty message when a search matches nothing", () => {
    render(<Harness emptyMessage="No drug by that name." />);
    fireEvent.focus(field());
    fireEvent.change(field(), { target: { value: 'zzzz' } });
    expect(screen.getByText('No drug by that name.')).toBeDefined();
  });

  it('leaves the options alone in server-search mode and reports the query', () => {
    const onSearch = vi.fn();
    render(<Harness filter={false} onSearch={onSearch} />);
    fireEvent.focus(field());
    fireEvent.change(field(), { target: { value: 'zzzz' } });
    expect(onSearch).toHaveBeenLastCalledWith('zzzz');
    // The server decides what matches; the component must not filter its answer away.
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('routes a pick to onSelect for a search-and-add control, leaving the field to the caller', () => {
    const onSelect = vi.fn();
    const onChange = vi.fn();
    render(<Harness onSelect={onSelect} onChange={onChange} />);
    fireEvent.focus(field());
    fireEvent.pointerDown(screen.getByRole('option', { name: /Metformin/ }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ value: 'd3' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('hints that the typed value is not in the master, only while it is not', () => {
    render(<Harness customValueHint="Not in the drug master; pharmacy will match it by hand" />);
    fireEvent.change(field(), { target: { value: 'Ayurvedic syrup' } });
    expect(screen.getByText(/Not in the drug master/)).toBeDefined();

    fireEvent.change(field(), { target: { value: 'Metformin 500 mg' } });
    expect(screen.queryByText(/Not in the drug master/)).toBeNull();
  });

  it('clears back to empty and reports no option', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(field(), { target: { value: 'Para' } });
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Clear' }));
    expect(onChange).toHaveBeenLastCalledWith('', null);
  });

  it('drops an unmatched value on blur when free text is not allowed', () => {
    const onChange = vi.fn();
    render(<Harness allowCustomValue={false} onChange={onChange} />);
    fireEvent.change(field(), { target: { value: 'not a drug' } });
    fireEvent.blur(field());
    expect(onChange).toHaveBeenLastCalledWith('', null);
  });

  it('keeps a matched value on blur when free text is not allowed', () => {
    const onChange = vi.fn();
    render(<Harness allowCustomValue={false} onChange={onChange} />);
    fireEvent.change(field(), { target: { value: 'Metformin 500 mg' } });
    onChange.mockClear();
    fireEvent.blur(field());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('marks the field invalid and shows the error instead of the hint', () => {
    render(<Harness error="Pick a drug" hint="Type to search" />);
    expect(field().getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Pick a drug')).toBeDefined();
    expect(screen.queryByText('Type to search')).toBeNull();
  });

  it('does not open, list or clear while disabled', () => {
    render(<Harness value="Metformin 500 mg" disabled />);
    fireEvent.focus(field());
    expect(screen.queryByRole('option')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
  });
});
