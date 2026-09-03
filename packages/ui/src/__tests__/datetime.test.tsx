import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DateDisplay, DateTimeDisplay, TimeDisplay } from '../components/DateTimeDisplay';

/**
 * The user-facing date/time components (ADR-046). These pin the two things that
 * matter: the platform's format, and the machine-readable value that has to travel
 * alongside it so assistive technology gets an unambiguous instant.
 *
 * Covers TC FMT-01 … FMT-04 in testcases.md.
 */

const AFTERNOON = new Date(2026, 7, 16, 16, 45); // 16/08/2026, 04:45 PM

describe('DateDisplay', () => {
  it('renders DD/MM/YYYY and carries the ISO value', () => {
    render(<DateDisplay value={AFTERNOON} />);
    const el = screen.getByText('16/08/2026');
    expect(el.tagName).toBe('TIME');
    expect(el.getAttribute('datetime')).toBe('2026-08-16');
  });

  it("shows a placeholder rather than 'Invalid Date'", () => {
    render(<DateDisplay value={null} />);
    expect(screen.getByText('—')).toBeDefined();
  });
});

describe('TimeDisplay', () => {
  it('renders 12-hour time with a meridiem', () => {
    const { container } = render(<TimeDisplay value={AFTERNOON} />);
    expect(container.textContent).toBe('04:45 PM');
  });

  it('renders the meridiem as a badge when asked', () => {
    const { container } = render(<TimeDisplay value={AFTERNOON} badge />);
    const badge = container.querySelector('.hms-meridiem');
    expect(badge?.textContent).toBe('PM');
    expect(container.textContent).toContain('04:45');
  });

  it('keeps midnight as 12 AM, not 00', () => {
    const { container } = render(<TimeDisplay value={new Date(2026, 7, 16, 0, 5)} />);
    expect(container.textContent).toBe('12:05 AM');
  });
});

describe('DateTimeDisplay', () => {
  it('joins them with a comma, as the standard requires', () => {
    const { container } = render(<DateTimeDisplay value={AFTERNOON} />);
    expect(container.textContent).toBe('16/08/2026, 04:45 PM');
  });

  it('badges the meridiem without losing the date', () => {
    const { container } = render(<DateTimeDisplay value={AFTERNOON} badge />);
    expect(container.textContent).toContain('16/08/2026, 04:45');
    expect(container.querySelector('.hms-meridiem')?.textContent).toBe('PM');
  });
});
