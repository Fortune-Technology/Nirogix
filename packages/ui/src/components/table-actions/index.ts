// The one Action-column system (rules.md → Table Row Actions).
//
// Every table with row-level operations composes its Action column from these:
// a `TableActions` group holding up to three inline icon actions, with everything
// else behind `MoreActions`. Presentation, tooltips, accessible names, disabled
// and loading states, confirmation, and permission gating live here — a module
// supplies intent only.

export {
  TableActions,
  TableAction,
  ViewAction,
  EditAction,
  DeleteAction,
  ToggleAction,
} from './TableActions';
export type {
  TableActionsProps,
  TableActionProps,
  GenericTableActionProps,
  DeleteActionProps,
  ToggleActionProps,
  ActionConfirm,
} from './TableActions';
export { MoreActions } from './MoreActions';
export type { MoreActionsProps, MoreAction } from './MoreActions';
export { actionsColumn } from './actionsColumn';
