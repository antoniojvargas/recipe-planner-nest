import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types, type HydratedDocument } from 'mongoose';

/** Roles posibles dentro de un hogar. */
export const HOUSEHOLD_ROLES = ['owner', 'member'] as const;

export type HouseholdRole = (typeof HOUSEHOLD_ROLES)[number];

/**
 * Membresía de un usuario en un hogar.
 *
 * `_id: false` porque la membresía no es una entidad con identidad propia: la identifica
 * el par (hogar, usuario) y se actualiza con `arrayFilters` sobre `members.userId`.
 */
@Schema({ _id: false })
export class HouseholdMember {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: HOUSEHOLD_ROLES, required: true, default: 'member' })
  role: HouseholdRole;

  @Prop({ type: Date, required: true, default: Date.now })
  joinedAt: Date;
}

export const HouseholdMemberSchema = SchemaFactory.createForClass(HouseholdMember);

@Schema({ timestamps: true, collection: 'households' })
export class Household {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: [HouseholdMemberSchema], default: [] })
  members: HouseholdMember[];

  /**
   * Hash del código de invitación vigente. `select: false` para que no salga en las
   * lecturas normales del hogar: solo lo consulta el flujo de invitaciones.
   */
  @Prop({ trim: true, select: false })
  inviteCodeHash?: string;

  createdAt: Date;
  updatedAt: Date;
}

export type HouseholdDocument = HydratedDocument<Household>;

export const HouseholdSchema = SchemaFactory.createForClass(Household);

// Consulta habitual: "los hogares a los que pertenece este usuario".
HouseholdSchema.index({ 'members.userId': 1 });
