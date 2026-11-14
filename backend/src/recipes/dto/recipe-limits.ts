/**
 * Límites de tamaño de una receta.
 *
 * Acotan lo que se guarda en un solo documento de Mongo y lo que se pinta en una pantalla;
 * una receta doméstica no necesita más. Los DTOs y sus tests comparten estos números para que
 * perilla y mensaje de error no se desincronicen.
 */
export const RECIPE_LIMITS = {
  ingredients: 100,
  steps: 50,
  tags: 20,
  tagLength: 40,
  title: 120,
  description: 2000,
} as const;
