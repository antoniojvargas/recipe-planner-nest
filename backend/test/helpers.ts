import request from 'supertest';
import { Types } from 'mongoose';
import { AppModule } from '../src/app.module.js';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { AuthTokensService } from '../src/auth/auth-tokens.service.js';

export interface AuthAgent {
  agent: ReturnType<typeof request>;
  close: () => Promise<void>;
  token: string;
}

/**
 * Crea un agente Supertest autenticado con un usuario registrado.
 * 
 * @param email - Email del usuario a registrar
 * @param password - Contraseña (opcional, usa una por defecto)
 * @returns Objeto con el agente y el token de acceso
 */
export async function createAuthenticatedAgent(
  email: string,
  password = 'Correcta123'
): Promise<AuthAgent> {
  // Arrancar la app en modo testing para obtener el servidor
  const moduleRef = await import('@nestjs/testing').then(m => m.Test.createTestingModule({ imports: [AppModule] })).then(mod => mod.Test.compile());
  const app = moduleRef.createNestApplication(new FastifyAdapter());
  
  // Configurar la app
  const configureApp = (await import('../src/app.setup.js')).configureApp;
  await configureApp(app);
  await app.init();
  
  // Registrar usuario
  const response = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({ email, password })
    .expect(201);
  
  const token = response.headers['set-cookie']
    ?.find((cookie: string) => cookie.startsWith('access_token='))
    ?.split(';')[0]
    .split('=')[1];
  
  if (!token) {
    throw new Error('No se pudo obtener el token de acceso');
  }
  
  const agent = request.agent(app.getHttpServer());
  
  return {
    agent,
    close: async () => await app.close(),
    token,
  };
}

/**
 * Factory para crear recetas de prueba.
 */
export interface RecipeFactoryInput {
  householdId: string;
  title: string;
  description?: string;
  servings?: number;
  prepMinutes?: number;
  cookMinutes?: number;
  tags?: string[];
  ingredients?: { name: string; quantity: number; unit: string }[];
  steps?: string[];
  image?: string;
  source?: string;
  createdBy?: string;
}

/** Factory function para crear una receta en el repositorio de test. */
export function createRecipeFactory(
  repository: any
) {
  return async (input: RecipeFactoryInput): Promise<any> => {
    const now = new Date();
    const recipe = {
      _id: new Types.ObjectId(),
      householdId: new Types.ObjectId(input.householdId),
      title: input.title,
      description: input.description,
      servings: input.servings ?? 4,
      prepMinutes: input.prepMinutes ?? 0,
      cookMinutes: input.cookMinutes ?? 0,
      tags: input.tags ?? [],
      ingredients: input.ingredients ?? [],
      steps: input.steps ?? [],
      image: input.image,
      source: input.source,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    repository.recipes.push(recipe);
    return recipe;
  };
}

/**
 * Factory para crear planes de comida de prueba.
 */
export interface MealPlanFactoryInput {
  householdId: string;
  weekStart: string;
  slots?: { day: number; meal: string; recipeId?: string; servings: number }[];
}

export function createMealPlanFactory(
  repository: any
) {
  return async (input: MealPlanFactoryInput): Promise<any> => {
    const now = new Date();
    const weekStart = new Date(input.weekStart);
    const slots = input.slots ?? [];
    
    const mealPlan = {
      _id: new Types.ObjectId(),
      householdId: new Types.ObjectId(input.householdId),
      weekStart: input.weekStart,
      slots,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    
    repository.mealPlans?.push(mealPlan);
    return mealPlan;
  };
}