import { parseIngredient, extractRecipe, type ParsedIngredient } from '../src/imports/recipe-parser';

describe('Recipe parser - parseIngredient', () => {
  it('parse "400 g de arroz" → {quantity: 400, unit: "g", name: "arroz"}', () => {
    const result = parseIngredient('400 g de arroz');
    expect(result).toEqual({ quantity: 400, unit: 'g', name: 'arroz' });
  });

  it('parse "1 1/2 tazas de harina" → {quantity: 1.5, unit: "cup", name: "harina"}', () => {
    const result = parseIngredient('1 1/2 tazas de harina');
    expect(result).toEqual({ quantity: 1.5, unit: 'cup', name: 'harina' });
  });

  it('parse "1/2 cucharadita de sal" → {quantity: 0.5, unit: "tsp", name: "sal"}', () => {
    const result = parseIngredient('1/2 cucharadita de sal');
    expect(result).toEqual({ quantity: 0.5, unit: 'tsp', name: 'sal' });
  });

  it('parse "200 g de brócoli" → {quantity: 200, unit: "g", name: "brócoli"}', () => {
    const result = parseIngredient('200 g de brócoli');
    expect(result).toEqual({ quantity: 200, unit: 'g', name: 'brócoli' });
  });

  it('parse "150 ml de leche de coco" → {quantity: 150, unit: "ml", name: "leche de coco"}', () => {
    const result = parseIngredient('150 ml de leche de coco');
    expect(result).toEqual({ quantity: 150, unit: 'ml', name: 'leche de coco' });
  });

  it('parse "una pizca de nuez moscada" → nota explicando unidad no reconocida', () => {
    const result = parseIngredient('una pizca de nuez moscada');
    expect(result.note).toBeDefined();
    expect(result.name).toContain('nuez moscada');
  });

  it('parse "500 g de harina de fuerza" → {quantity: 500, unit: "g", name: "harina de fuerza"}', () => {
    const result = parseIngredient('500 g de harina de fuerza');
    expect(result).toEqual({ quantity: 500, unit: 'g', name: 'harina de fuerza' });
  });

  it('parse "350 ml de agua" → {quantity: 350, unit: "ml", name: "agua"}', () => {
    const result = parseIngredient('350 ml de agua');
    expect(result).toEqual({ quantity: 350, unit: 'ml', name: 'agua' });
  });

  it('parse "10 g de sal" → {quantity: 10, unit: "g", name: "sal"}', () => {
    const result = parseIngredient('10 g de sal');
    expect(result).toEqual({ quantity: 10, unit: 'g', name: 'sal' });
  });

  it('parse texto vacío → {quantity: 0, unit: "unit", name: ""}', () => {
    const result = parseIngredient('');
    expect(result).toEqual({ quantity: 0, unit: 'unit', name: '' });
  });

  it('parse "sin unidades" → nota y nombre preservado', () => {
    const result = parseIngredient('harina sin unidades');
    expect(result.note).toBeDefined();
    expect(result.name).toContain('harina');
  });
});

describe('Recipe parser - extractRecipe', () => {
  const jsonLdHtml = `
    <html><body>
    <script type="application/ld+json">
    {
      "@context": "https://schema.org/",
      "@type": "Recipe",
      "name": "Paella Valenciana",
      "description": "La receta tradicional de paella valenciana",
      "recipeYield": "4 personas",
      "recipeIngredient": ["400 g de arroz", "1 1/2 cucharaditas de azafrán"],
      "recipeInstructions": [{"@text": "Sofríe la verdura."}]
    }
    </script>
    </body></html>`;

  const microdataHtml = `
    <div itemscope itemtype="http://schema.org/Recipe">
      <meta itemprop="name" content="Curry de Verduras"/>
      <span itemprop="recipeIngredient">200 g de brócoli</span>
      <span itemprop="recipeInstructions">Saltear todos los vegetales.</span>
    </div>`;

  it('extrae de JSON-LD cuando está presente', () => {
    const result = extractRecipe(jsonLdHtml);
    expect(result.success).toBe(true);
    expect(result.recipe?.title).toBe('Paella Valenciana');
    expect(Array.isArray(result.recipe?.ingredients)).toBe(true);
  });

  it('fallback a microdata cuando no hay JSON-LD', () => {
    const result = extractRecipe(microdataHtml);
    expect(result.success).toBe(true);
    expect(result.recipe?.title).toBe('Curry de Verduras');
    expect(Array.isArray(result.recipe?.ingredients)).toBe(true);
  });

  it('devuelve success: false cuando no hay nada reconocible', () => {
    const result = extractRecipe('<html><body>Hola mundo</body></html>');
    expect(result.success).toBe(false);
    expect(result.recipe).toBeNull();
  });
});
