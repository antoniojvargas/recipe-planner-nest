import type { NextConfig } from 'next';

/**
 * La API corre en otro proceso: `http://backend:3000` dentro de Compose y
 * `http://localhost:3000` en desarrollo local. El rewrite hace que el navegador llame a
 * `/api` en el mismo origen de Next, así las cookies `httpOnly` viajan solas y el cliente
 * no necesita CORS ni conocer la URL interna.
 */
const apiInternalUrl =
  process.env.API_INTERNAL_URL?.trim().replace(/\/+$/, '') ?? 'http://localhost:3000';

const nextConfig: NextConfig = {
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