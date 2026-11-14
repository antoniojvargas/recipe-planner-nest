import { Types } from 'mongoose';
import { AppException } from '../common/exceptions/app.exception.js';
import type { MediaService } from '../media/media.service.js';
import type { CreateRecipeDto } from './dto/create-recipe.dto.js';
import type { UpdateRecipeDto } from './dto/update-recipe.dto.js';
import type { Recipe } from './recipe.schema.js';
import { decodeCursor, encodeCursor } from './recipes.cursor.js';
import type { RecipesRepository } from './recipes.repository.js';
import { RecipesService } from './recipes.service.js';

function createRepositoryMock() {
  const mocks = {
    create: vi.fn(),
    findById: vi.fn(),
    findPage: vi.fn(),
    searchPage: vi.fn(),
    updateById: vi.fn(),
    deleteById: vi.fn(),
  };

  return { repository: mocks as unknown as RecipesRepository, mocks };
}

function createMediaMock() {
  return createMediaDoubles().media;
}

function createMediaDoubles() {
  const mocks = {
    inspectImage: vi.fn(),
    enqueueThumbnail: vi.fn().mockResolvedValue(undefined),
    enqueueImageDeletion: vi.fn().mockResolvedValue(undefined),
    signImageUrls: vi.fn().mockResolvedValue({
      originalUrl: 'https://media.test/original.png',
      smallUrl: 'https://media.test/photo-320.webp',
      largeUrl: 'https://media.test/photo-960.webp',
    }),
  };

  return { media: mocks as unknown as MediaService, mocks };
}

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    _id: new Types.ObjectId(),
    householdId: new Types.ObjectId(),
    title: 'Paella valenciana',
    description: 'La de siempre',
    servings: 4,
    prepMinutes: 20,
    cookMinutes: 40,
    tags: ['arroz'],
    ingredients: [{ name: 'Arroz', quantity: 400, unit: 'g' }],
    steps: [{ text: 'Sofríe la verdura.' }],
    createdBy: new Types.ObjectId(),
    createdAt: new Date('2026-02-01T10:00:00.000Z'),
    updatedAt: new Date('2026-02-02T10:00:00.000Z'),
    ...overrides,
  };
}

function page(count: number): Recipe[] {
  return Array.from({ length: count }, (_, index) =>
    makeRecipe({
      title: `Receta ${String(index)}`,
      updatedAt: new Date(Date.UTC(2026, 1, 10 - index, 10)),
    }),
  );
}

async function expectAppException(fn: () => Promise<unknown>): Promise<AppException> {
  try {
    await fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AppException);

    return error as AppException;
  }

  throw new Error('Se esperaba una AppException');
}

describe('RecipesService', () => {
  const householdId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();

  describe('create', () => {
    it('asigna hogar y autor y devuelve la receta creada', async () => {
      const { repository, mocks } = createRepositoryMock();
      const service = new RecipesService(repository, createMediaMock());
      const created = makeRecipe({ title: 'Tortilla' });
      mocks.create.mockResolvedValue(created);

      const dto: CreateRecipeDto = {
        title: 'Tortilla',
        servings: 2,
        ingredients: [{ name: 'Huevo', quantity: 4, unit: 'unit' }],
        steps: [{ text: 'Bate los huevos.' }],
      };

      const response = await service.create(householdId, userId, dto);

      expect(mocks.create).toHaveBeenCalledWith({
        householdId: new Types.ObjectId(householdId),
        createdBy: new Types.ObjectId(userId),
        title: 'Tortilla',
        servings: 2,
        ingredients: dto.ingredients,
        steps: dto.steps,
      });
      expect(response).toMatchObject({ id: created._id.toString(), title: 'Tortilla' });
      expect(response.householdId).toBe(created.householdId.toString());
      expect(response.createdBy).toBe(created.createdBy.toString());
    });
  });

  describe('list', () => {
    it('devuelve la página y un cursor con la última receta servida', async () => {
      const { repository, mocks } = createRepositoryMock();
      const service = new RecipesService(repository, createMediaMock());
      const recipes = page(3);
      mocks.findPage.mockResolvedValue(recipes);

      const result = await service.list(householdId, { limit: 2 });
      const last = recipes[1];

      expect(mocks.findPage).toHaveBeenCalledWith(householdId, {
        limit: 3,
        tags: [],
      });
      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).not.toBeNull();
      expect(decodeCursor(result.nextCursor ?? '')).toEqual({
        updatedAt: last.updatedAt,
        id: last._id,
      });
    });

    it('devuelve nextCursor null en la última página', async () => {
      const { repository, mocks } = createRepositoryMock();
      const service = new RecipesService(repository, createMediaMock());
      mocks.findPage.mockResolvedValue(page(2));

      const result = await service.list(householdId, { limit: 2 });

      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBeNull();
    });

    it('usa 20 resultados por defecto y pasa las etiquetas normalizadas', async () => {
      const { repository, mocks } = createRepositoryMock();
      const service = new RecipesService(repository, createMediaMock());
      mocks.findPage.mockResolvedValue([]);

      await service.list(householdId, { tags: ['arroz', 'rapido'] });

      expect(mocks.findPage).toHaveBeenCalledWith(householdId, {
        limit: 21,
        tags: ['arroz', 'rapido'],
      });
    });

    it('con q busca en el índice de texto y el cursor lleva la puntuación', async () => {
      const { repository, mocks } = createRepositoryMock();
      const service = new RecipesService(repository, createMediaMock());
      const first = makeRecipe({ title: 'Paella', updatedAt: new Date('2026-02-03T10:00:00Z') });
      const second = makeRecipe({
        title: 'Arroz negro',
        updatedAt: new Date('2026-02-02T10:00:00Z'),
      });
      const third = makeRecipe({ title: 'Fideuá', updatedAt: new Date('2026-02-01T10:00:00Z') });
      mocks.searchPage.mockResolvedValue([
        Object.assign(first, { score: 2.5 }),
        Object.assign(second, { score: 1 }),
        Object.assign(third, { score: 0.5 }),
      ]);

      const result = await service.list(householdId, { q: 'paella', limit: 2 });

      expect(mocks.searchPage).toHaveBeenCalledWith(householdId, {
        q: 'paella',
        tags: [],
        limit: 3,
      });
      expect(result.nextCursor).not.toBeNull();
      expect(decodeCursor(result.nextCursor ?? '')?.score).toBe(1);
    });

    it('rechaza un cursor irrecuperable', async () => {
      const { repository } = createRepositoryMock();
      const service = new RecipesService(repository, createMediaMock());

      const exception = await expectAppException(() =>
        service.list(householdId, { cursor: 'basura' }),
      );

      expect(exception.code).toBe('VALIDATION_ERROR');
      expect(exception.details).toEqual([
        { field: 'cursor', message: 'El cursor no se puede decodificar' },
      ]);
    });

    it('rechaza un cursor de recetario en una búsqueda', async () => {
      const { repository } = createRepositoryMock();
      const service = new RecipesService(repository, createMediaMock());
      const recipe = makeRecipe();
      const cursor = encodeCursor({ updatedAt: recipe.updatedAt, id: recipe._id });
      const exception = await expectAppException(() =>
        service.list(householdId, { q: 'paella', cursor }),
      );

      expect(exception.code).toBe('VALIDATION_ERROR');
      expect(exception.details[0]?.message).toBe('El cursor no corresponde a una búsqueda');
    });
  });

  describe('findOne', () => {
    it('devuelve 404 si la receta no es del hogar', async () => {
      const { repository, mocks } = createRepositoryMock();
      const service = new RecipesService(repository, createMediaMock());
      mocks.findById.mockResolvedValue(null);

      const exception = await expectAppException(() =>
        service.findOne(householdId, new Types.ObjectId().toString()),
      );

      expect(exception.getStatus()).toBe(404);
      expect(exception.code).toBe('NOT_FOUND');
    });

    it('devuelve la receta con los identificadores como strings', async () => {
      const { repository, mocks } = createRepositoryMock();
      const service = new RecipesService(repository, createMediaMock());
      const recipe = makeRecipe();
      mocks.findById.mockResolvedValue(recipe);

      const response = await service.findOne(householdId, recipe._id.toString());

      expect(response).toEqual({
        id: recipe._id.toString(),
        householdId: recipe.householdId.toString(),
        title: recipe.title,
        description: recipe.description,
        servings: 4,
        prepMinutes: 20,
        cookMinutes: 40,
        tags: ['arroz'],
        ingredients: [{ name: 'Arroz', quantity: 400, unit: 'g' }],
        steps: [{ text: 'Sofríe la verdura.' }],
        createdBy: recipe.createdBy.toString(),
        createdAt: recipe.createdAt,
        updatedAt: recipe.updatedAt,
      });
    });

    it('firma URLs temporales de la imagen al leer la receta', async () => {
      const { repository, mocks } = createRepositoryMock();
      const media = createMediaDoubles();
      const service = new RecipesService(repository, media.media);
      const key = `households/${householdId}/foto.png`;
      mocks.findById.mockResolvedValue(makeRecipe({ image: { key, width: 1200, height: 800 } }));

      const response = await service.findOne(householdId, new Types.ObjectId().toString());

      expect(media.mocks.signImageUrls).toHaveBeenCalledWith(key);
      expect(response.image).toEqual({
        key,
        width: 1200,
        height: 800,
        originalUrl: 'https://media.test/original.png',
        smallUrl: 'https://media.test/photo-320.webp',
        largeUrl: 'https://media.test/photo-960.webp',
      });
    });
  });

  describe('update', () => {
    it('solo actualiza los campos presentes en el parche', async () => {
      const { repository, mocks } = createRepositoryMock();
      const service = new RecipesService(repository, createMediaMock());
      const updated = makeRecipe({ title: 'Arroz negro' });
      mocks.updateById.mockResolvedValue(updated);

      const dto: UpdateRecipeDto = { title: 'Arroz negro', servings: 6 };
      const response = await service.update(householdId, updated._id.toString(), dto);

      expect(mocks.updateById).toHaveBeenCalledWith(householdId, updated._id.toString(), {
        $set: { title: 'Arroz negro', servings: 6 },
      });
      expect(response.title).toBe('Arroz negro');
    });

    it('sin campos devuelve la receta existente sin escribir en Mongo', async () => {
      const { repository, mocks } = createRepositoryMock();
      const service = new RecipesService(repository, createMediaMock());
      const recipe = makeRecipe();
      mocks.findById.mockResolvedValue(recipe);

      const response = await service.update(householdId, recipe._id.toString(), {});

      expect(mocks.updateById).not.toHaveBeenCalled();
      expect(response.id).toBe(recipe._id.toString());
    });

    it('devuelve 404 si la receta no existe o es de otro hogar', async () => {
      const { repository, mocks } = createRepositoryMock();
      const service = new RecipesService(repository, createMediaMock());
      mocks.updateById.mockResolvedValue(null);

      const exception = await expectAppException(() =>
        service.update(householdId, new Types.ObjectId().toString(), { title: 'Otra' }),
      );

      expect(exception.code).toBe('NOT_FOUND');
    });
  });

  describe('confirmImage', () => {
    const key = `households/${householdId}/foto.png`;
    const oldKey = `households/${householdId}/vieja.png`;
    const image = { key, width: 1200, height: 800, size: 2048 };

    it('guarda la imagen, encola las miniaturas y firma sus URLs', async () => {
      const { repository, mocks } = createRepositoryMock();
      const media = createMediaDoubles();
      media.mocks.inspectImage.mockResolvedValue(image);
      const service = new RecipesService(repository, media.media);
      const recipeId = new Types.ObjectId().toString();
      const current = makeRecipe();
      const updated = makeRecipe({
        _id: new Types.ObjectId(recipeId),
        image: { key, width: 1200, height: 800 },
      });
      mocks.findById.mockResolvedValue(current);
      mocks.updateById.mockResolvedValue(updated);

      const response = await service.confirmImage(householdId, recipeId, { key });

      expect(media.mocks.inspectImage).toHaveBeenCalledWith(householdId, key);
      expect(mocks.updateById).toHaveBeenCalledWith(householdId, recipeId, {
        $set: { image: { key, width: 1200, height: 800 } },
      });
      expect(media.mocks.enqueueThumbnail).toHaveBeenCalledWith({ householdId, recipeId, key });
      expect(media.mocks.enqueueImageDeletion).not.toHaveBeenCalled();
      expect(media.mocks.signImageUrls).toHaveBeenCalledWith(key);
      expect(response.image).toEqual(expect.objectContaining({ key, width: 1200, height: 800 }));
      expect(response.image?.originalUrl).toContain('original.png');
      expect(response.image?.smallUrl).toContain('320');
      expect(response.image?.largeUrl).toContain('960');
    });

    it('al cambiar la imagen encola el borrado del original anterior y sus variantes', async () => {
      const { repository, mocks } = createRepositoryMock();
      const media = createMediaDoubles();
      media.mocks.inspectImage.mockResolvedValue(image);
      const service = new RecipesService(repository, media.media);
      const recipeId = new Types.ObjectId().toString();
      const current = makeRecipe({ image: { key: oldKey, width: 1000, height: 700 } });
      mocks.findById.mockResolvedValue(current);
      mocks.updateById.mockResolvedValue(
        makeRecipe({ _id: new Types.ObjectId(recipeId), image: { key, width: 1200, height: 800 } }),
      );

      await service.confirmImage(householdId, recipeId, { key });

      expect(media.mocks.enqueueImageDeletion).toHaveBeenCalledWith(householdId, recipeId, oldKey);
    });

    it('reconfirmar la misma clave no borra la imagen recién encolada', async () => {
      const { repository, mocks } = createRepositoryMock();
      const media = createMediaDoubles();
      media.mocks.inspectImage.mockResolvedValue(image);
      const service = new RecipesService(repository, media.media);
      const recipeId = new Types.ObjectId().toString();
      mocks.findById.mockResolvedValue(makeRecipe({ image: { key, width: 1200, height: 800 } }));
      mocks.updateById.mockResolvedValue(
        makeRecipe({ _id: new Types.ObjectId(recipeId), image: { key, width: 1200, height: 800 } }),
      );

      await service.confirmImage(householdId, recipeId, { key });

      expect(media.mocks.enqueueImageDeletion).not.toHaveBeenCalled();
    });

    it('devuelve 404 sin inspeccionar ni encolar si la receta no existe', async () => {
      const { repository, mocks } = createRepositoryMock();
      const media = createMediaDoubles();
      const service = new RecipesService(repository, media.media);
      mocks.findById.mockResolvedValue(null);

      const exception = await expectAppException(() =>
        service.confirmImage(householdId, new Types.ObjectId().toString(), { key }),
      );

      expect(exception.code).toBe('NOT_FOUND');
      expect(media.mocks.inspectImage).not.toHaveBeenCalled();
      expect(media.mocks.enqueueThumbnail).not.toHaveBeenCalled();
    });

    it('no toca Mongo ni la cola si la imagen no es válida', async () => {
      const { repository, mocks } = createRepositoryMock();
      const media = createMediaDoubles();
      media.mocks.inspectImage.mockRejectedValue(new Error('imagen inválida'));
      const service = new RecipesService(repository, media.media);
      mocks.findById.mockResolvedValue(makeRecipe());

      await expect(
        service.confirmImage(householdId, new Types.ObjectId().toString(), { key }),
      ).rejects.toThrow('imagen inválida');
      expect(mocks.updateById).not.toHaveBeenCalled();
      expect(media.mocks.enqueueThumbnail).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('borra la receta y encola los objetos de su imagen', async () => {
      const { repository, mocks } = createRepositoryMock();
      const media = createMediaDoubles();
      const service = new RecipesService(repository, media.media);
      const recipeId = new Types.ObjectId().toString();
      const key = `households/${householdId}/foto.png`;
      mocks.findById.mockResolvedValue(makeRecipe({ image: { key, width: 10, height: 10 } }));
      mocks.deleteById.mockResolvedValue(true);

      await expect(service.remove(householdId, recipeId)).resolves.toBeUndefined();
      expect(mocks.deleteById).toHaveBeenCalledWith(householdId, recipeId);
      expect(media.mocks.enqueueImageDeletion).toHaveBeenCalledWith(householdId, recipeId, key);
    });

    it('no encola nada si la receta no tenía imagen', async () => {
      const { repository, mocks } = createRepositoryMock();
      const media = createMediaDoubles();
      const service = new RecipesService(repository, media.media);
      mocks.findById.mockResolvedValue(makeRecipe());
      mocks.deleteById.mockResolvedValue(true);

      await service.remove(householdId, new Types.ObjectId().toString());

      expect(media.mocks.enqueueImageDeletion).not.toHaveBeenCalled();
    });

    it('devuelve 404 si no había nada que borrar', async () => {
      const { repository, mocks } = createRepositoryMock();
      const service = new RecipesService(repository, createMediaMock());
      mocks.findById.mockResolvedValue(makeRecipe());
      mocks.deleteById.mockResolvedValue(false);

      const exception = await expectAppException(() =>
        service.remove(householdId, new Types.ObjectId().toString()),
      );

      expect(exception.code).toBe('NOT_FOUND');
    });
  });
});
