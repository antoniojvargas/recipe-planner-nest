/**
 * Lee una cookie del header `Cookie` de una petición que no pasa por Fastify.
 *
 * El guard HTTP recibe las cookies ya parseadas por `@fastify/cookie`, pero el handshake de
 * Socket.IO llega con el header en crudo. Aquí se extrae solo el valor que se necesita, sin
 * incorporar un parser completo: el access token es un JWT con caracteres base64url y no
 * contiene `;`.
 */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (header === undefined || header === '') {
    return undefined;
  }

  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');

    if (separator === -1) {
      continue;
    }

    if (pair.slice(0, separator).trim() !== name) {
      continue;
    }

    const value = pair.slice(separator + 1).trim();

    if (value === '') {
      return undefined;
    }

    try {
      return decodeURIComponent(value);
    } catch {
      // Un valor mal codificado se usa tal cual: la firma del JWT decidirá si vale.
      return value;
    }
  }

  return undefined;
}
