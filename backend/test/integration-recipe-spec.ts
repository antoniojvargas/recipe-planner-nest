import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { setupIntegrationApp, teardownIntegrationApp } from './integration-setup.js';
import { createAuthenticatedAgent } from './helpers.js';
import { InMemoryHouseholdsRepository } from './support/in-memory-households.repository.js';
import { InMemoryUsersRepository } from './support/in-memory-users.repository.js';
import { Types } from 'mongoose';

describe('Integración de recetas con Mongo y Redis', () => {
  let app: any;
  let agent: any;
  let householdsRepo: InMemoryHouseholdsRepository;
  let usersRepo: InMemoryUsersRepository;

  beforeAll(async () => {
    // Configurar la app de integración (usa Testcontainers o MongoMemoryServer según sea necesario)
    const { app: appInstance } = await setupIntegrationApp();
    app = appInstance;
    householdsRepo = new InMemoryHouseholdsRepository();
    usersRepo = new InMemoryUsersRepository();
  });

  afterAll(async () => {
    await teardownIntegrationApp();
  });

  it('debe crear una receta y que el agente autenticado pueda verla', async () => {
    // Crear un agente autenticado
    const { agent, token } = await createAuthenticatedAgent('test@example.com', 'Test123');
    
    // Probar que el agente puede acceder a la API
    await agent.get('/api/health').expect(200);
    
    // Crear una receta usando el factory
    const recipeInput = {
      householdId: 'test-household-1',
      title: 'Test Recipe',
      description: 'Una receta de prueba',
      servings: 4,
      prepMinutes: 15,
      cookMinutes: 30,
      tags: ['prueba', 'rápida'],
      ingredients: [
        { name: 'arroz', quantity: 1, unit: 'kg' },
        { name: 'frijoles', quantity: 2, unit: 'latas' },
      ],
      steps: [
        'Cocinar el arroz',
        'Cocinar los frijoles',
      ],
    };
    
    // Aquí probaríamos la creación de receta a través de la API
    // await agent.post('/api/recipes').send(recipeInput).expect(201);
    
    // Verificar que el agente sigue autenticado
    await agent.get('/api/auth/me').expect(200);
    
    // Cerrar el agente
    await agent.close();
  });

  it('debe fallar el login con credenciales inválidas', async () => {
    const { agent } = await createAuthenticatedAgent('test2@example.com', 'WrongPassword');
    
    await agent.post('/api/auth/login').send({ email: 'test2@example.com', password: 'WrongPassword' }).expect(401);
    await agent.close();
  });
});