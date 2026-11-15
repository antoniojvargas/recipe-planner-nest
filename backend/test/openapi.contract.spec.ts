import { describe, it, expect } from 'vitest';
import { readFile } from 'fs/promises';

describe('OpenAPI contract', () => {
  it('debe tener security scheme de cookie definido', async () => {
    const content = await readFile('src/openapi.json', 'utf8');
    const document = JSON.parse(content);

    // Verificar security schemes
    expect(document.components?.securitySchemes).toBeDefined();
    expect(document.components?.securitySchemes?.cookie).toEqual({
      type: 'apiKey',
      in: 'cookie',
      name: 'access_token',
    });
    expect(document.components?.securitySchemes?.bearerAuth).toEqual({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    });

    // Verificar security requirements
    expect(document.security).toBeDefined();
    expect(Array.isArray(document.security)).toBe(true);
    expect(document.security.some((s: any) => s.cookie)).toBe(true);
    expect(document.security.some((s: any) => s.bearerAuth)).toBe(true);
  });

  it('debe tener info y version', async () => {
    const content = await readFile('src/openapi.json', 'utf8');
    const document = JSON.parse(content);

    expect(document.info).toEqual(
      expect.objectContaining({
        title: 'Recipe Planner API',
        version: '1.0',
      }),
    );
  });

  it('debe tener servers definido', async () => {
    const content = await readFile('src/openapi.json', 'utf8');
    const document = JSON.parse(content);

    expect(document.servers).toBeDefined();
    expect(document.servers.length).toBeGreaterThan(0);
  });
});