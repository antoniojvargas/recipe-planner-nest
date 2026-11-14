import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types, type HydratedDocument } from 'mongoose';

/**
 * Un refresh token emitido. Cada fila es un eslabón de una familia: el login abre la
 * familia, cada refresh añade una fila nueva con el mismo `familyId` y marca la anterior
 * con `usedAt`.
 *
 * `familyId` es un UUID, no un `ObjectId`: solo agrupa eslabones y no referencia ningún
 * documento.
 */
@Schema({ timestamps: true, collection: 'refresh_sessions' })
export class RefreshSession {
  _id: Types.ObjectId;

  @Prop({ required: true })
  familyId: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  /** SHA-256 del token en claro; el token nunca se persiste. */
  @Prop({ required: true })
  tokenHash: string;

  @Prop({ required: true })
  expiresAt: Date;

  /** Cuándo se canjeó; `null` mientras sigue siendo válido. */
  @Prop({ type: Date, default: null })
  usedAt: Date | null;

  /** Cuándo se revocó la fila (logout o reutilización detectada). */
  @Prop({ type: Date, default: null })
  revokedAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export type RefreshSessionDocument = HydratedDocument<RefreshSession>;

export const RefreshSessionSchema = SchemaFactory.createForClass(RefreshSession);

// Búsqueda del refresh por igualdad: el hash no puede repetirse.
RefreshSessionSchema.index({ tokenHash: 1 }, { unique: true });

// Revocar una familia es un `updateMany` por este campo.
RefreshSessionSchema.index({ familyId: 1 });

// Limpieza de filas caducadas. No es seguridad: al leer siempre se comprueba `expiresAt`.
RefreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
