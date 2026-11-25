import { Expose, Type } from 'class-transformer';
import type { HouseholdRole } from './household.schema.js';

export class HouseholdMemberResponse {
  @Expose()
  userId: string;

  /** Nombre visible del miembro, para no mostrar ids en la interfaz. */
  @Expose()
  displayName: string;

  @Expose()
  role: HouseholdRole;

  @Expose()
  joinedAt: Date;
}

export class HouseholdResponse {
  @Expose()
  id: string;

  @Expose()
  name: string;

  /** Zona IANA del hogar: con ella se calcula la semana del plan. */
  @Expose()
  timeZone: string;

  @Expose()
  @Type(() => HouseholdMemberResponse)
  members: HouseholdMemberResponse[];

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;
}

export class HouseholdInviteResponse {
  @Expose()
  code: string;

  @Expose()
  expiresAt: Date;
}
