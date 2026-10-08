import { SetMetadata } from '@nestjs/common';
import type { Role } from '@prisma/client';

export const IS_PUBLIC = 'isPublic';
export const ROLES = 'roles';

/** Route vereist geen sessie. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Route vereist een van de opgegeven rollen. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: Role;
  sessionId: string;
  csrfToken: string;
}
