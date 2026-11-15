import { createNestApplication } from '../dist/main.js';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import fs from 'fs';

async function main() {
  const app = createNestApplication();
  const documentBuilder = new DocumentBuilder()
    .setTitle('Recipe Planner API')
    .setDescription('API para el planificador de recetas')
    .setVersion('1.0')
    .addServer(process.env.PUBLIC_URL ?? 'http://localhost:3000', 'Servidor de la API')
    .addSecurity('cookie', {
      type: 'apiKey',
      in: 'cookie',
      name: 'access_token',
    })
    .addSecurity('bearer', {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    })
    .addSecurityRequirements('cookie')
    .addSecurityRequirements('bearer')
    .addTag('auth', 'Autenticación y sesiones')
    .addTag('households', 'Gestión de hogares')
    .addTag('recipes', 'Recetas y planes')
    .addTag('shopping', 'Listas de la compra')
    .addTag('imports', 'Importaciones')
    .addTag('media', 'Media y thumbnails')
    .addTag('health', 'Health checks')
    .build();

  const document = SwaggerModule.createDocument(app, documentBuilder);
  fs.writeFileSync('packages/contracts/openapi.json', JSON.stringify(document, null, 2));
  console.log('OpenAPI document exported to packages/contracts/openapi.json');
}

main().catch(console.error);