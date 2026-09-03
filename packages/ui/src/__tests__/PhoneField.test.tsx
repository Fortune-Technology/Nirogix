import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PhoneField, canonicalIndianMobile, localIndianMobile } from '../components/PhoneField';

/**
 * The Indian-mobile input (requirement: +91 handled for the user, 10 digits typed).
 * The normalisation is the part that must be exact — a doubled or missing country
 * code is a login/OTP failure — so it is tested directly, then through the field.
 */

describe('indian mobile normalisation', () => {
  it('keeps the last ten digits regardless of how the country code was supplied', () => {
    expect(localIndianMobile('9820011234')).toBe('9820011234');
    expect(localIndianMobile('+919820011234')).toBe('9820011234');
    expect(localIndianMobile('919820011234')).toBe('9820011234');
    expect(localIndianMobile('+91 98200 11234')).toBe('9820011234');
    expect(localIndianMobile('+91-98200-11234')).toBe('9820011234');
    // Doubled country code collapses instead of being accepted twice.
    expect(localIndianMobile('+91+919876543210')).toBe('9876543210');
  });

  it('canonicalises a valid mobile to +91XXXXXXXXXX and rejects everything else', () => {
    expect(canonicalIndianMobile('9820011234')).toBe('+919820011234');
    expect(canonicalIndianMobile('+919820011234')).toBe('+919820011234');
    // Fewer than ten digits is not yet a number.
    expect(canonicalIndianMobile('98200')).toBe('');
    // Indian mobiles start 6–9; a 5-leading number is not one.
    expect(canonicalIndianMobile('5820011234')).toBe('');
  });
});

describe('PhoneField', () => {
  it('shows the fixed +91 prefix and seeds the local part from a legacy value', () => {
    render(<PhoneField label="Mobile" value="+919820011234" onChange={() => {}} />);
    expect(screen.getByText('+91')).toBeDefined();
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('9820011234');
  });

  it('emits the canonical value once ten digits are entered', () => {
    const onChange = vi.fn();
    render(<PhoneField label="Mobile" value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '9820011234' } });
    expect(onChange).toHaveBeenLastCalledWith('+919820011234');
  });

  it('collapses a pasted +91 number instead of doubling the country code', () => {
    const onChange = vi.fn();
    render(<PhoneField label="Mobile" value="" onChange={onChange} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.paste(input, { clipboardData: { getData: () => '+91 98765 43210' } });
    expect(onChange).toHaveBeenLastCalledWith('+919876543210');
    expect(input.value).toBe('9876543210');
  });

  it('reports an incomplete number and emits an empty canonical value', () => {
    const onChange = vi.fn();
    render(<PhoneField label="Mobile" value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '98200' } });
    expect(onChange).toHaveBeenLastCalledWith('');
    expect(screen.getByText(/10-digit Indian mobile/i)).toBeDefined();
  });
});
