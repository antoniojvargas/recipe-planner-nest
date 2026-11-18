import type { HouseholdRole } from './household.schema.js';

export interface HouseholdMemberResponse {
  userId: string;
  /** Nombre visible del miembro, para no mostrar ids en la interfaz. */
  displayName: string;
  role: HouseholdRole;
  joinedAt: Date;
}

export interface HouseholdResponse {
  id: string;
  name: string;
  members: HouseholdMemberResponse[];
  createdAt: Date;
  updatedAt: Date;
}

export interface HouseholdInviteResponse {
  code: string;
  expiresAt: Date;
}
