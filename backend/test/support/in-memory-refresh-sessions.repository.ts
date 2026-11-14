import type { ClientSession } from 'mongoose';
import { Types } from 'mongoose';
import type { RefreshSession } from '../../src/auth/refresh-session.schema.js';
import type { CreateRefreshSessionInput } from '../../src/auth/refresh-sessions.repository.js';

interface StoredSession {
  familyId: string;
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
}

/**
 * Repositorio en memoria que simula las garantías que la rotación necesita: `claimForRotation`
 * es atómico (la comprobación y el marcado ocurren sin ceder el control) y `withTransaction`
 * ejecuta el trabajo en orden. Sirve para probar la rotación y la concurrencia sin Mongo real.
 */
export class InMemoryRefreshSessionsRepository {
  readonly sessions: StoredSession[] = [];
  private transactionQueue: Promise<void> = Promise.resolve();

  /* eslint-disable @typescript-eslint/no-unused-vars -- la firma imita la del repositorio real */
  create(input: CreateRefreshSessionInput, _session?: ClientSession): Promise<unknown> {
    const created: StoredSession = {
      familyId: input.familyId,
      userId: new Types.ObjectId(input.userId),
      tokenHash: input.tokenHash,
      expiresAt: new Date(input.expiresAt),
      usedAt: null,
      revokedAt: null,
    };
    this.sessions.push(created);

    return Promise.resolve({ ...created, _id: new Types.ObjectId() });
  }

  claimForRotation(
    tokenHash: string,
    now: Date,
    _session: ClientSession,
  ): Promise<RefreshSession | null> {
    const session = this.sessions.find(
      (item) =>
        item.tokenHash === tokenHash &&
        item.usedAt === null &&
        item.revokedAt === null &&
        item.expiresAt.getTime() > now.getTime(),
    );

    if (session === undefined) {
      return Promise.resolve(null);
    }

    session.usedAt = new Date(now);

    return Promise.resolve({ ...session } as unknown as RefreshSession);
  }

  findByTokenHash(tokenHash: string, _session: ClientSession): Promise<RefreshSession | null> {
    const session = this.sessions.find((item) => item.tokenHash === tokenHash);

    return Promise.resolve(
      session === undefined ? null : ({ ...session } as unknown as RefreshSession),
    );
  }

  revokeFamily(familyId: string, revokedAt: Date, _session?: ClientSession): Promise<void> {
    for (const session of this.sessions) {
      if (session.familyId === familyId && session.revokedAt === null) {
        session.revokedAt = new Date(revokedAt);
      }
    }

    return Promise.resolve();
  }
  /* eslint-enable @typescript-eslint/no-unused-vars */

  revokeAllForUser(userId: string, revokedAt: Date): Promise<void> {
    for (const session of this.sessions) {
      if (session.userId.toString() === userId && session.revokedAt === null) {
        session.revokedAt = new Date(revokedAt);
      }
    }

    return Promise.resolve();
  }

  async withTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
    const run = this.transactionQueue.then(() => work({} as ClientSession));
    this.transactionQueue = run.then(
      () => undefined,
      () => undefined,
    );

    return run;
  }

  /** Las sesiones vivas (sin revocar ni caducar en `now`) de una familia. */
  liveByFamily(familyId: string, now: Date): StoredSession[] {
    return this.sessions.filter(
      (session) =>
        session.familyId === familyId &&
        session.revokedAt === null &&
        session.expiresAt.getTime() > now.getTime(),
    );
  }
}
