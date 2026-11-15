import { Test, TestingModule } from '@nestjs/testing';
import { extractRecipe, parseIngredient } from '../../src/imports/recipe-parser.js';

describe('ImportsProcessor - parseIngredient', () => {
  it('parse "400 g de arroz" -> {quantity: 400, unit: "g", name: "arroz"}', () => {
    const result = parseIngredient('400 g de arroz');
    expect(result).toEqual({ quantity: 400, unit: 'g', name: 'arroz' });
  });

  it('parse "1 1/2 tazas de harina" -> {quantity: 1.5, unit: "cup", name: "harina"}', () => {
    const result = parseIngredient('1 1/2 tazas de harina');
    expect(result).toEqual({ quantity: 1.5, unit: 'cup', name: 'harina' });
  });

  it('parse "1/2 cucharadita de sal" -> {quantity: 0.5, unit: "tsp", name: "sal"}', () => {
    const result = parseIngredient('1/2 cucharadita de sal');
    expect(result).toEqual({ quantity: 0.5, unit: 'tsp', name: 'sal' });
  });

  it('parse "una pizca de nuez moscada" -> nota y nombre', () => {
    const result = parseIngredient('una pizca de nuez moscada');
    expect(result.note).toBeDefined();
    expect(result.name).toContain('nuez moscada');
  });

  it('parse texto vacio -> {quantity: 0, unit: "unit", name: ""}', () => {
    const result = parseIngredient('');
    expect(result).toEqual({ quantity: 0, unit: 'unit', name: '' });
  });
});

describe('ImportsProcessor - extractRecipe', () => {
  const jsonLdHtml = '<html><body><script type="application/ld+json">{ "@context": "https://schema.org/", "@type": "Recipe", "name": "Paella Valenciana", "recipeIngredient": ["400 g de arroz"], "recipeInstructions": [{"@text": "Sofríe la verdura."}]}' + '</script>' + '</body></html>';

  const microdataHtml = '<div itemscope itemtype="http://schema.org/Recipe"><meta itemprop="name" content="Curry de Verduras"/><span itemprop="recipeIngredient">200 g de brócoli</span></div>';

  it('extrae de JSON-LD cuando esta presente', () => {
    const result = extractRecipe(jsonLdHtml);
    expect(result.success).toBe(true);
    expect(result.recipe?.title).toBe('Paella Valenciana');
  });

  it('fallback a microdata cuando no hay JSON-LD', () => {
    const result = extractRecipe(microdataHtml);
    expect(result.success).toBe(true);
    expect(result.recipe?.title).toBe('Curry de Verduras');
  });

  it('devuelve success: false cuando no hay nada reconocible', () => {
    const result = extractRecipe('<html><body>Hola mundo</body></html>');
    expect(result.success).toBe(false);
    expect(result.recipe).toBeNull();
  });
});
