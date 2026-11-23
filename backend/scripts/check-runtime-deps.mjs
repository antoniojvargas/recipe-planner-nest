#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

/**
 * Comprueba que cada import con nombre de paquete que aparece en un directorio
 * compilado se resuelve desde sus `node_modules`.
 *
 * La imagen de producción no instala devDependencies y el reparto de `node_modules`
 * del workspace (hoisteado en la raíz o anidado en `backend/node_modules`) puede
 * cambiar entre versiones de npm. Este chequeo convierte ese riesgo en un fallo de
 * build en vez de un `ERR_MODULE_NOT_FOUND` al arrancar el contenedor:
 *
 *   node scripts/check-runtime-deps.mjs /app/backend/dist
 */

const distDir = resolve(process.argv[2] ?? 'dist');
const resolveFrom = createRequire(join(distDir, 'main.js')).resolve;

// `from "paquete"` / `from 'paquete'` / `import("paquete")` / `import('paquete')`.
const importPattern = /(?:from\s+|import\(\s*)(["'])([^"']+)\1/g;

const isBareSpecifier = (specifier) => !/^(?:\.|\/|[a-z]+:)/.test(specifier);

const files = readdirSync(distDir, { recursive: true, encoding: 'utf8' }).filter((file) =>
  file.endsWith('.js'),
);

const missing = new Set();

for (const file of files) {
  const code = readFileSync(join(distDir, file), 'utf8');

  for (const [, , specifier] of code.matchAll(importPattern)) {
    if (!isBareSpecifier(specifier)) continue;

    try {
      resolveFrom(specifier);
    } catch {
      missing.add(specifier);
    }
  }
}

if (missing.size > 0) {
  console.error(`Imports sin resolver en ${distDir}:`);
  for (const specifier of [...missing].sort()) console.error(`  - ${specifier}`);
  process.exit(1);
}

console.log(`${files.length} ficheros de ${distDir} con todos sus imports resueltos`);
