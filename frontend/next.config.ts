import { join } from 'node:path';
import type { NextConfig } from 'next';

/**
 * La API corre en otro proceso: `http://backend:3000` dentro de Compose y
 * `http://localhost:3000` en desarrollo local. El rewrite hace que el navegador llame a
 * `/api` en el mismo origen de Next, así las cookies `httpOnly` viajan solas y el cliente
 * no necesita CORS ni conocer la URL interna.
 *
 * Socket.IO no pasa por el rewrite: su handshake necesita la barra final de
 * `/socket.io/` y Next la normaliza antes de reenviar. En desarrollo el navegador conecta
 * con `NEXT_PUBLIC_API_URL` (ver `.env.example`); en producción Caddy enruta `/socket.io`.
 */
const apiInternalUrl =
  process.env.API_INTERNAL_URL?.trim().replace(/\/+$/, '') ?? 'http://localhost:3000';

const nextConfig: NextConfig = {
  // La imagen de producción arranca desde `.next/standalone`: Next deja ahí el servidor
  // con solo los ficheros que el trazado de imports marca como necesarios.
  output: 'standalone',
  // En un workspace las dependencias viven en la raíz del repo, no en `frontend/`. Sin
  // esto el trazado corta en el directorio de la app y el standalone se queda sin
  // `node_modules` (ni sin `@recipe-planner/contracts`, que es un symlink al paquete).
  outputFileTracingRoot: join(__dirname, '..'),
  // El paquete de contratos se compila en el monorepo; Next lo transpila como código propio.
  transpilePackages: ['@recipe-planner/contracts'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiInternalUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
