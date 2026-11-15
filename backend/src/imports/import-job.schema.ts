import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types, type HydratedDocument } from 'mongoose';

/** Estados por los que pasa una importación desde que se encola hasta que termina. */
export const IMPORT_JOB_STATUSES = ['pending', 'processing', 'completed', 'failed'] as const;

export type ImportJobStatus = (typeof IMPORT_JOB_STATUSES)[number];

/**
 * Trabajo de importación de una receta desde una URL.
 *
 * La API crea el documento y encola el trabajo; el worker lo consume y actualiza su estado,
 * guardando la receta resultante o el motivo del fallo. El `jobId` es único para que dos
 * peticiones iguales dentro de la misma ventana no creen dos trabajos.
 */
@Schema({ timestamps: true, collection: 'import_jobs' })
export class ImportJob {
  _id: Types.ObjectId;

  /** Hogar al que pertenecerá la receta importada; límite de aislamiento. */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Household', required: true })
  householdId: Types.ObjectId;

  /** Usuario que pidió la importación; será el autor de la receta. */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({ required: true, trim: true })
  url: string;

  @Prop({ type: String, enum: IMPORT_JOB_STATUSES, required: true, default: 'pending' })
  status: ImportJobStatus;

  /** Receta creada al terminar; solo está presente si el trabajo se completó. */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Recipe' })
  recipeId?: Types.ObjectId;

  /** Código y mensaje del último fallo, para que el cliente pueda mostrarlo. */
  @Prop({ trim: true })
  errorCode?: string;

  @Prop({ trim: true })
  errorMessage?: string;

  /**
   * Identificador determinista del trabajo en BullMQ.
   *
   * Se calcula por hogar, URL y ventana de diez minutos. El índice único es la segunda
   * barrera contra duplicados: aunque dos peticiones lleguen a la vez, solo una crea el
   * documento y las demás reutilizan el existente.
   */
  @Prop({ required: true, unique: true })
  jobId: string;

  createdAt: Date;
  updatedAt: Date;
}

export type ImportJobDocument = HydratedDocument<ImportJob>;

export const ImportJobSchema = SchemaFactory.createForClass(ImportJob);

// Consulta habitual: el estado de las importaciones de un hogar, de la más reciente a la más
// antigua.
ImportJobSchema.index({ householdId: 1, createdAt: -1 });
