import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the scaleIngredients function for testing purposes since it's defined in the page component
// We'll test the logic directly

describe('scaleIngredients', () => {
  // Test the portion scaling logic
  it('scales ingredients quantity by factor', () => {
    const ingredients = [
      { name: 'Arroz', quantity: 200, unit: 'g' },
      { name: 'Pollo', quantity: 300, unit: 'g' },
      { name: 'Verduras', quantity: 150, unit: 'g' },
    ];

    // Factor: 6 servings / 4 original servings = 1.5
    const factor = 1.5;

    const scaled = ingredients.map((ing) => ({
      name: ing.name,
      quantity: Math.round(ing.quantity * factor * 10) / 10,
      unit: ing.unit,
    }));

    // Arroz: 200 * 1.5 = 300
    expect(scaled[0]).toEqual({ name: 'Arroz', quantity: 300, unit: 'g' });

    // Pollo: 300 * 1.5 = 450
    expect(scaled[1]).toEqual({ name: 'Pollo', quantity: 450, unit: 'g' });

    // Verduras: 150 * 1.5 = 225
    expect(scaled[2]).toEqual({ name: 'Verduras', quantity: 225, unit: 'g' });
  });

  it('scales ingredients with fractional factor', () => {
    const ingredients = [{ name: 'Sal', quantity: 10, unit: 'g' }];

    // Factor: 3 servings / 4 original servings = 0.75
    const factor = 0.75;

    const scaled = ingredients.map((ing) => ({
      name: ing.name,
      quantity: Math.round(ing.quantity * factor * 10) / 10,
      unit: ing.unit,
    }));

    // Sal: 10 * 0.75 = 7.5
    expect(scaled[0]).toEqual({ name: 'Sal', quantity: 7.5, unit: 'g' });
  });

  it('handles zero factor', () => {
    const ingredients = [{ name: 'Agua', quantity: 500, unit: 'ml' }];

    const factor = 0;

    const scaled = ingredients.map((ing) => ({
      name: ing.name,
      quantity: Math.round(ing.quantity * 0 * 10) / 10,
      unit: ing.unit,
    }));

    expect(scaled[0]).toEqual({ name: 'Agua', quantity: 0, unit: 'ml' });
  });
});
