import { Router } from 'express';
import { PERMISSIONS } from '@hms/permissions';
import { validate } from '../../http/validate';
import { asyncHandler } from '../../http/asyncHandler';
import { requireAuth } from '../../http/requireAuth';
import { requirePermission } from '../../http/requirePermission';
import { CreateDepartmentBody, UpdateDepartmentBody, DepartmentQuery } from './department.schema';
import * as c from './department.controller';

/**
 * Departments (ADR-050). Not module-gated: a department is organisational structure that every
 * entitled clinical module reads, in the same way branches are — it belongs to Platform Core,
 * not to one purchasable module.
 *
 * Reading is held by the roles that work a department (front desk, doctors, branch admins);
 * maintaining the list is `platform.departments.manage`, which only org_admin holds.
 */
export const departmentRouter = Router();

departmentRouter.get(
  '/departments',
  requireAuth,
  requirePermission(PERMISSIONS.DEPARTMENT_VIEW),
  validate({ query: DepartmentQuery }),
  asyncHandler(c.list),
);

departmentRouter.get(
  '/departments/:id',
  requireAuth,
  requirePermission(PERMISSIONS.DEPARTMENT_VIEW),
  asyncHandler(c.getOne),
);

departmentRouter.post(
  '/departments',
  requireAuth,
  requirePermission(PERMISSIONS.DEPARTMENT_MANAGE),
  validate({ body: CreateDepartmentBody }),
  asyncHandler(c.create),
);

departmentRouter.patch(
  '/departments/:id',
  requireAuth,
  requirePermission(PERMISSIONS.DEPARTMENT_MANAGE),
  validate({ body: UpdateDepartmentBody }),
  asyncHandler(c.update),
);
