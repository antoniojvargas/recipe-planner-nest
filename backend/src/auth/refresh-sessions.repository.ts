import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { RefreshSession, type RefreshSessionDocument } from './refresh-session.schema.js';

export interface CreateRefreshSessionInput {
  familyId: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

/**
 * Único punto de acceso a la colección `refresh_sessions`.
 *
 * No filtra por `householdId`: las sesiones son del usuario y viven por encima de los
 * hogares. Las lecturas de esta colección no necesitan `lean()` porque la rotación
 * actualiza documentos, pero aquí solo se crean filas.
 */
@Injectable()
export class RefreshSessionsRepository {
  constructor(
    @InjectModel(RefreshSession.name) private readonly sessionModel: Model<RefreshSession>,
  ) {}

  async create(input: CreateRefreshSessionInput): Promise<RefreshSessionDocument> {
    return this.sessionModel.create(input);
  }
}
