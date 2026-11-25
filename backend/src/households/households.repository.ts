import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Household, type HouseholdDocument, type HouseholdMember } from './household.schema.js';

export interface CreateHouseholdInput {
  name: string;
  timeZone?: string;
  members?: HouseholdMember[];
  inviteCodeHash?: string;
  inviteCodeExpiresAt?: Date;
}

/**
 * Único punto de acceso a la colección `households`.
 *
 * El propio hogar es la raíz del aislamiento, así que se identifica por `_id`; las consultas
 * que lo cruzan filtran por la membresía (`members.userId`). Los agregados que cuelgan de él
 * (recetas, planes, lista, despensa) sí llevan `householdId` en todos sus filtros.
 * Las lecturas usan `lean()`.
 */
@Injectable()
export class HouseholdsRepository {
  constructor(@InjectModel(Household.name) private readonly householdModel: Model<Household>) {}

  async create(input: CreateHouseholdInput): Promise<HouseholdDocument> {
    return this.householdModel.create(input);
  }

  async findById(householdId: string): Promise<Household | null> {
    return this.householdModel.findById(householdId).lean<Household>().exec();
  }

  /** Hogares a los que pertenece un usuario. */
  async findByMember(userId: string): Promise<Household[]> {
    return this.householdModel.find({ 'members.userId': userId }).lean<Household[]>().exec();
  }

  /** Solo los `_id` de los hogares del usuario: es lo que necesitan las salas de Socket.IO. */
  async findIdsByMember(userId: string): Promise<string[]> {
    const households = await this.householdModel
      .find({ 'members.userId': userId })
      .select('_id')
      .lean<Pick<Household, '_id'>[]>()
      .exec();

    return households.map((household) => household._id.toString());
  }

  /** Solo devuelve un hogar si el hash del código de invitación coincide. */
  async findByInviteCodeHash(inviteCodeHash: string): Promise<Household | null> {
    return this.householdModel
      .findOne({ inviteCodeHash })
      .select('+inviteCodeExpiresAt')
      .lean<Household>()
      .exec();
  }

  async addMember(householdId: string, member: HouseholdMember): Promise<Household | null> {
    return this.householdModel
      .findByIdAndUpdate(
        householdId,
        { $push: { members: member } },
        { returnDocument: 'after', runValidators: true },
      )
      .lean<Household>()
      .exec();
  }

  async removeMember(householdId: string, userId: string): Promise<Household | null> {
    return this.householdModel
      .findByIdAndUpdate(
        householdId,
        { $pull: { members: { userId } } },
        { returnDocument: 'after' },
      )
      .lean<Household>()
      .exec();
  }

  /** Cambia el rol de un miembro concreto sin tocar al resto. */
  async setMemberRole(
    householdId: string,
    userId: string,
    role: HouseholdMember['role'],
  ): Promise<Household | null> {
    return this.householdModel
      .findOneAndUpdate(
        { _id: householdId, 'members.userId': userId },
        { $set: { 'members.$.role': role } },
        { returnDocument: 'after' },
      )
      .lean<Household>()
      .exec();
  }

  /**
   * Rellena la zona horaria de los hogares creados antes de que existiera el campo.
   *
   * El filtro solo toca documentos sin `timeZone`, así que es idempotente y no pisa una zona
   * ya elegida. Devuelve cuántos documentos modificó.
   */
  async backfillMissingTimeZone(timeZone: string): Promise<number> {
    const result = await this.householdModel
      .updateMany({ timeZone: { $exists: false } }, { $set: { timeZone } })
      .exec();

    return result.modifiedCount;
  }

  /** Guarda el hash y la caducidad del código de invitación vigente; el código no se persiste. */
  async setInviteCode(
    householdId: string,
    inviteCodeHash: string,
    inviteCodeExpiresAt: Date,
  ): Promise<Household | null> {
    return this.householdModel
      .findByIdAndUpdate(
        householdId,
        { $set: { inviteCodeHash, inviteCodeExpiresAt } },
        { returnDocument: 'after', runValidators: true },
      )
      .lean<Household>()
      .exec();
  }
}
