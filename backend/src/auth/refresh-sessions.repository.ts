import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { ClientSession, Connection, Model } from 'mongoose';
import { RefreshSession, type RefreshSessionDocument } from './refresh-session.schema.js';

export interface CreateRefreshSessionInput {
  familyId: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

/** Opciones de la transacción: lectura consistente y confirmación en la mayoría del replica set. */
const TRANSACTION_OPTIONS = {
  readConcern: { level: 'snapshot' as const },
  writeConcern: { w: 'majority' as const },
};

/**
 * Único punto de acceso a la colección `refresh_sessions`.
 *
 * No filtra por `householdId`: las sesiones son del usuario y viven por encima de los
 * hogares. La rotación necesita varias escrituras (marcar el token usado, revocar una
 * familia e insertar el siguiente eslabón) que deben confirmarse juntas, así que el
 * repositorio expone `withTransaction` y recibe la sesión en cada operación.
 */
@Injectable()
export class RefreshSessionsRepository {
  constructor(
    @InjectModel(RefreshSession.name) private readonly sessionModel: Model<RefreshSession>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async create(
    input: CreateRefreshSessionInput,
    session?: ClientSession,
  ): Promise<RefreshSessionDocument> {
    if (session === undefined) {
      return this.sessionModel.create(input);
    }

    const [created] = await this.sessionModel.create([input], { session });

    return created;
  }

  /**
   * Consume el token en una sola escritura atómica. El filtro exige que siga sin usar, sin
   * revocar y sin caducar: dos peticiones con el mismo token no pueden marcarlo las dos, y
   * la segunda recibe `null`.
   */
  async claimForRotation(
    tokenHash: string,
    now: Date,
    session: ClientSession,
  ): Promise<RefreshSession | null> {
    return this.sessionModel
      .findOneAndUpdate(
        { tokenHash, usedAt: null, revokedAt: null, expiresAt: { $gt: now } },
        { $set: { usedAt: now } },
        { session, returnDocument: 'after' },
      )
      .lean<RefreshSession>()
      .exec();
  }

  /** Lee la fila para clasificar por qué no se pudo consumir (usada, revocada o caducada). */
  async findByTokenHash(tokenHash: string, session: ClientSession): Promise<RefreshSession | null> {
    return this.sessionModel.findOne({ tokenHash }).session(session).lean<RefreshSession>().exec();
  }

  /** Revoca todos los eslabones vivos de una familia. */
  async revokeFamily(familyId: string, revokedAt: Date, session: ClientSession): Promise<void> {
    await this.sessionModel
      .updateMany({ familyId, revokedAt: null }, { $set: { revokedAt } }, { session })
      .exec();
  }

  /**
   * Ejecuta el trabajo en una transacción. `withTransaction` reintenta los errores
   * transitorios (incluidos los conflictos de escritura entre dos refresh simultáneos), así
   * que el llamador puede asumir que el callback se repite hasta confirmar o fallar de forma
   * definitiva.
   */
  async withTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = await this.connection.startSession();

    try {
      return await session.withTransaction(() => work(session), TRANSACTION_OPTIONS);
    } finally {
      await session.endSession();
    }
  }
}
