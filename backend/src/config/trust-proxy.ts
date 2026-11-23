/**
 * Red de los bridges de Docker donde Caddy y la API comparten red en producción. Fastify
 * solo acepta `X-Forwarded-For` cuando el par de la conexión está en esta red: una petición
 * que llegue directamente al backend (sin pasar por Caddy) no puede elegir la IP que ve
 * el throttler.
 */
export const CADDY_NETWORK_CIDR = '172.16.0.0/12';

/** Opciones del adaptador Fastify. Nunca `true`: eso confiaría en cualquier proxy. */
export function trustProxyOptions(): { trustProxy: string } {
  const configured = process.env.TRUST_PROXY?.trim();

  return {
    trustProxy: configured === undefined || configured === '' ? CADDY_NETWORK_CIDR : configured,
  };
}
