import { SetMetadata } from '@nestjs/common';
import type { HouseholdRole as HouseholdRoleName } from '../household.schema.js';

export const HOUSEHOLD_ROLE_KEY = 'householdRole';

/** Exige que el miembro del hogar tenga el rol indicado (además de pertenecer al hogar). */
export const HouseholdRole = (role: HouseholdRoleName): MethodDecorator & ClassDecorator =>
  SetMetadata(HOUSEHOLD_ROLE_KEY, role);
