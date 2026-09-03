import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DateField } from '../components/datetime/DateField';
import { TimeField } from '../components/datetime/TimeField';

/**
 * The date/time inputs (ADR-048). The contract that matters: the user reads and
 * types the platform's format, and what leaves the component is always ISO —
 * a native `<input type="date">` gets the first half wrong on half the world's
 * machines, which is why these exist.
 *
 * Covers TC FMT-07 … FMT-11 in testcases.md.
 */

describe('DateField', () => {
  it('shows an ISO value as DD/MM/YYYY', () => {
    render(<DateField label="Date of birth" value="2026-08-16" onChange={() => {}} />);
    expect(screen.getByRole('textbox')).toHaveProperty('value', '16/08/2026');
  });

  it('accepts DD/MM/YYYY typing and emits ISO', () => {
    const onChange = vi.fn();
    render(<DateField label="Date of birth" value={null} onChange={onChange} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '05/01/2027' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith('2027-01-05');
  });

  it('clearing the field emits null rather than an invalid date', () => {
    const onChange = vi.fn();
    render(<DateField value="2026-08-16" onChange={onChange} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('rejects an impossible date and restores the last good value', () => {
    const onChange = vi.fn();
    render(<DateField value="2026-08-16" onChange={onChange} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '32/13/2026' } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveProperty('value', '16/08/2026');
  });

  it('refuses a date outside the allowed range', () => {
    const onChange = vi.fn();
    render(<DateField value={null} max="2026-08-16" onChange={onChange} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '20/08/2026' } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('offers the calendar as a labelled control', () => {
    render(<DateField label="Expiry" value={null} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Choose expiry' })).toBeDefined();
  });
});

describe('TimeField', () => {
  it('splits a 24-hour value into 12-hour parts', () => {
    render(<TimeField label="Time" value="16:45" onChange={() => {}} />);
    expect(screen.getByLabelText('Hour')).toHaveProperty('value', '04');
    expect(screen.getByLabelText('Minute')).toHaveProperty('value', '45');
    expect(screen.getByRole('button', { name: 'PM', pressed: true })).toBeDefined();
  });

  it('emits 24-hour time when the meridiem changes', () => {
    const onChange = vi.fn();
    render(<TimeField value="04:45" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'PM' }));
    expect(onChange).toHaveBeenCalledWith('16:45');
  });

  it('handles the noon and midnight edges', () => {
    const onChange = vi.fn();
    const { rerender } = render(<TimeField value="12:00" onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'PM', pressed: true })).toBeDefined();

    rerender(<TimeField value="00:30" onChange={onChange} />);
    expect(screen.getByLabelText('Hour')).toHaveProperty('value', '12');
    expect(screen.getByRole('button', { name: 'AM', pressed: true })).toBeDefined();
  });

  it('emits null while the entry is incomplete', () => {
    const onChange = vi.fn();
    render(<TimeField value={null} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Hour'), { target: { value: '9' } });
    expect(onChange).toHaveBeenCalledWith(null); // no minute yet
  });
});
