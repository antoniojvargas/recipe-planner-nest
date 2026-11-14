import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { UNITS_LIST, type Unit } from '@recipe-planner/contracts';
import { SchemaTypes, Types, type HydratedDocument } from 'mongoose';

/**
 * Ingrediente embebido en la receta.
 *
 * `_id: false` porque no se edita por separado: la receta se guarda entera y sus ingredientes
 * se leen siempre con ella. La lista de la compra copia estos valores cuando se genera.
 */
@Schema({ _id: false })
export class RecipeIngredient {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: Number, required: true, min: 0 })
  quantity: number;

  /** Unidad del catálogo compartido (`g`, `kg`, `ml`, `l`, `tsp`, `tbsp`, `cup`, `unit`, `pinch`). */
  @Prop({ type: String, enum: [...UNITS_LIST], required: true })
  unit: Unit;

  /** Aclaración libre: "picado", "a temperatura ambiente", … */
  @Prop({ trim: true })
  note?: string;
}

export const RecipeIngredientSchema = SchemaFactory.createForClass(RecipeIngredient);

@Schema({ _id: false })
export class RecipeStep {
  @Prop({ required: true, trim: true })
  text: string;
}

export const RecipeStepSchema = SchemaFactory.createForClass(RecipeStep);

/** Imagen de portada: clave en MinIO/S3 y dimensiones para reservar el espacio en la web. */
@Schema({ _id: false })
export class RecipeImage {
  @Prop({ required: true, trim: true })
  key: string;

  @Prop({ type: Number, required: true, min: 1 })
  width: number;

  @Prop({ type: Number, required: true, min: 1 })
  height: number;
}

export const RecipeImageSchema = SchemaFactory.createForClass(RecipeImage);

/** Origen de una receta importada desde una URL. */
@Schema({ _id: false })
export class RecipeSource {
  @Prop({ required: true, trim: true })
  url: string;

  @Prop({ type: Date, required: true, default: Date.now })
  importedAt: Date;
}

export const RecipeSourceSchema = SchemaFactory.createForClass(RecipeSource);

@Schema({ timestamps: true, collection: 'recipes' })
export class Recipe {
  _id: Types.ObjectId;

  /** Hogar al que pertenece la receta; límite de aislamiento de todas las consultas. */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Household', required: true })
  householdId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ type: Number, required: true, min: 1 })
  servings: number;

  @Prop({ type: Number, min: 0, default: 0 })
  prepMinutes: number;

  @Prop({ type: Number, min: 0, default: 0 })
  cookMinutes: number;

  /** Etiquetas normalizadas para que la búsqueda y el filtrado no dependan de mayúsculas. */
  @Prop({ type: [{ type: String, trim: true, lowercase: true }], default: [] })
  tags: string[];

  @Prop({ type: [RecipeIngredientSchema], default: [] })
  ingredients: RecipeIngredient[];

  @Prop({ type: [RecipeStepSchema], default: [] })
  steps: RecipeStep[];

  @Prop({ type: RecipeImageSchema })
  image?: RecipeImage;

  @Prop({ type: RecipeSourceSchema })
  source?: RecipeSource;

  /** Autor de la receta; se guarda la referencia, no una copia del perfil. */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

export type RecipeDocument = HydratedDocument<Recipe>;

export const RecipeSchema = SchemaFactory.createForClass(Recipe);

// Búsqueda de recetas: el título pesa más que las etiquetas y los ingredientes.
RecipeSchema.index(
  { title: 'text', tags: 'text', 'ingredients.name': 'text' },
  {
    name: 'recipe_text',
    weights: { title: 10, tags: 5, 'ingredients.name': 3 },
    default_language: 'spanish',
  },
);

// Listado del recetario de un hogar, de la receta más reciente a la más antigua.
RecipeSchema.index({ householdId: 1, updatedAt: -1 });
