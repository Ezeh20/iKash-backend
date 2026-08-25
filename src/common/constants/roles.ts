import { AppRole } from '../interfaces/app-role.interface';

/** Roles that may bypass resource ownership checks. */
export const PRIVILEGED_ROLES: ReadonlySet<AppRole> = new Set<AppRole>([
  AppRole.admin,
  AppRole.support,
]);
