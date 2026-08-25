import { SetMetadata } from '@nestjs/common';
import { AppRole } from '../interfaces/app-role.interface';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: AppRole[]) =>
  SetMetadata<string, AppRole[]>(ROLES_KEY, roles);
