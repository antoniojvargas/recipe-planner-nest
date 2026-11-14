import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { UNITS_LIST, type Unit } from '@recipe-planner/contracts';
import { SchemaTypes, Types, type HydratedDocument } from 'mongoose';

@Schema({ timestamps: true, collection: 'pantry_items' })
export class PantryItem {
  _id: Types.ObjectId;

  /** Hogar al que pertenece el artículo; límite de aislamiento de todas las consultas. */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Household', required: true })
  householdId: Types.ObjectId;

  /** Nombre normalizado: sin espacios sobrantes y en minúsculas, para comparar y descontar. */
  @Prop({ required: true, trim: true, lowercase: true })
  name: string;

  @Prop({ type: Number, required: true, min: 0 })
  quantity: number;

  /** Unidad del catálogo compartido (`g`, `kg`, `ml`, `l`, `tsp`, `tbsp`, `cup`, `unit`, `pinch`). */
  @Prop({ type: String, enum: [...UNITS_LIST], required: true })
  unit: Unit;

  createdAt: Date;
  updatedAt: Date;
}

export type PantryItemDocument = HydratedDocument<PantryItem>;

export const PantryItemSchema = SchemaFactory.createForClass(PantryItem);

// Consulta habitual: la despensa de un hogar, y búsqueda por nombre al descontar la lista.
PantryItemSchema.index({ householdId: 1, name: 1 });
