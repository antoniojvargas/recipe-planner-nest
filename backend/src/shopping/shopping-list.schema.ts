import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { UNITS_LIST, type Unit } from '@recipe-planner/contracts';
import { SchemaTypes, Types, type HydratedDocument } from 'mongoose';
import { WEEK_START_VALIDATION } from '../common/week.js';

/** Procedencia de un ítem: generado desde el plan o añadido a mano. */
export const SHOPPING_ITEM_SOURCES = ['plan', 'manual'] as const;

export type ShoppingItemSource = (typeof SHOPPING_ITEM_SOURCES)[number];

/**
 * Ítem embebido en la lista.
 *
 * A diferencia de los ingredientes de una receta, aquí sí hay `_id`: el cliente marca un ítem
 * concreto y ese identificador viaja en los eventos de Socket.IO y en las actualizaciones
 * parciales (`arrayFilters`).
 */
@Schema()
export class ShoppingListItem {
  _id: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: Number, required: true, min: 0 })
  quantity: number;

  /** Unidad del catálogo compartido (`g`, `kg`, `ml`, `l`, `tsp`, `tbsp`, `cup`, `unit`, `pinch`). */
  @Prop({ type: String, enum: [...UNITS_LIST], required: true })
  unit: Unit;

  @Prop({ type: Boolean, default: false })
  checked: boolean;

  /** Quién marcó el ítem; solo tiene valor cuando `checked` es `true`. */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  checkedBy?: Types.ObjectId;

  @Prop({ type: String, enum: [...SHOPPING_ITEM_SOURCES], default: 'manual' })
  source: ShoppingItemSource;
}

export const ShoppingListItemSchema = SchemaFactory.createForClass(ShoppingListItem);

@Schema({
  timestamps: true,
  collection: 'shopping_lists',
  // `version` en lugar de `__v`: cada `save()` comprueba la versión leída y la incrementa,
  // así dos pestañas que marcan ítems a la vez no se pisan.
  optimisticConcurrency: true,
  versionKey: 'version',
})
export class ShoppingList {
  /** Hogar al que pertenece la lista; límite de aislamiento de todas las consultas. */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Household', required: true })
  householdId: Types.ObjectId;

  /** Lunes de la semana a las 00:00 UTC, igual que en el plan. */
  @Prop({ type: Date, required: true, validate: WEEK_START_VALIDATION })
  weekStart: Date;

  @Prop({ type: [ShoppingListItemSchema], default: [] })
  items: ShoppingListItem[];

  version: number;

  createdAt: Date;
  updatedAt: Date;
}

export type ShoppingListDocument = HydratedDocument<ShoppingList>;

export const ShoppingListSchema = SchemaFactory.createForClass(ShoppingList);

// Una lista por hogar y semana: regenerarla actualiza la misma, no crea otra.
ShoppingListSchema.index({ householdId: 1, weekStart: 1 }, { unique: true });
