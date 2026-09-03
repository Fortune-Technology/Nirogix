import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import {
  DeleteAction,
  EditAction,
  MoreActions,
  TableAction,
  TableActions,
  ToggleAction,
  ViewAction,
} from '../components/table-actions';

/**
 * The Action column is the one row-actions system (rules.md → Table Row Actions),
 * so a regression here hits every table in the platform at once. These cover what
 * the modules rely on: permission gating, the confirmation gate on destructive
 * actions, disabled/loading behaviour, and the toggle's switch semantics.
 *
 * Covers TC ACT-01 … ACT-08 in testcases.md.
 */

describe('permission handling', () => {
  it('renders nothing for an action the user is not permitted', () => {
    render(
      <TableActions label="Actions for Ananya Sharma">
        <ViewAction onSelect={() => {}} />
        <EditAction permitted={false} onSelect={() => {}} />
      </TableActions>,
    );
    expect(screen.getByRole('button', { name: 'View' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('labels the group so a screen reader knows which row it belongs to', () => {
    render(
      <TableActions label="Actions for Ananya Sharma">
        <ViewAction onSelect={() => {}} />
      </TableActions>,
    );
    expect(screen.getByRole('group', { name: 'Actions for Ananya Sharma' })).toBeDefined();
  });
});

describe('disabled and loading', () => {
  it('explains a disabled action through its tooltip instead of failing silently', () => {
    render(
      <EditAction
        disabled
        disabledReason="Signed encounters cannot be edited."
        onSelect={() => {}}
      />,
    );
    const button = screen.getByRole('button', { name: 'Edit' });
    expect(button.getAttribute('disabled')).not.toBeNull();
    expect(button.getAttribute('title')).toBe('Signed encounters cannot be edited.');
  });

  it('stops accepting input while the action is in flight', () => {
    const onSelect = vi.fn();
    render(<EditAction loading onSelect={onSelect} />);
    const button = screen.getByRole('button', { name: 'Edit' });
    expect(button.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(button);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('destructive actions', () => {
  it('never deletes on a single click — the confirmation has to be accepted', () => {
    const onSelect = vi.fn();
    render(<DeleteAction recordName="Bright Care Clinic" onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByText('Delete Bright Care Clinic?')).toBeDefined();

    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('cancelling the confirmation leaves the record alone', () => {
    const onSelect = vi.fn();
    render(<DeleteAction recordName="Bright Care Clinic" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('toggle', () => {
  it('is a real switch and reports the state the user asked for', () => {
    const onToggle = vi.fn();
    render(
      <ToggleAction
        on={false}
        offLabel="Activate branch"
        onLabel="Deactivate branch"
        onToggle={onToggle}
      />,
    );
    const toggle = screen.getByRole('switch', { name: 'Activate branch' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('confirms first when the caller asks it to', () => {
    const onToggle = vi.fn();
    render(
      <ToggleAction
        on
        onLabel="Suspend tenant"
        confirm={{ title: 'Suspend Bright Care Clinic?', confirmLabel: 'Suspend' }}
        onToggle={onToggle}
      />,
    );
    fireEvent.click(screen.getByRole('switch', { name: 'Suspend tenant' }));
    expect(onToggle).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    expect(onToggle).toHaveBeenCalledWith(false);
  });
});

describe('overflow menu', () => {
  it('renders nothing when the user is permitted none of the actions', () => {
    const { container } = render(
      <MoreActions actions={[{ label: 'Reset password', permitted: false, onSelect: () => {} }]} />,
    );
    expect(container.querySelector('.hms-rowaction')).toBeNull();
  });

  it('opens the shared menu and runs the chosen action', () => {
    const onSelect = vi.fn();
    render(<MoreActions actions={[{ label: 'Reset password', onSelect }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reset password' }));
    expect(onSelect).toHaveBeenCalledOnce();
  });
});

describe('context-specific actions', () => {
  it("uses the same control as View/Edit/Delete, with the module's own icon and label", () => {
    const onSelect = vi.fn();
    render(<TableAction label="Start consult" icon={<svg />} onSelect={onSelect} />);
    const button = screen.getByRole('button', { name: 'Start consult' });
    expect(button.className).toContain('hms-rowaction');
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
