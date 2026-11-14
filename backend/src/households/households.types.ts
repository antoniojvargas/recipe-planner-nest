import type { HouseholdRole } from './household.schema.js';

export interface HouseholdMemberResponse {
  userId: string;
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
