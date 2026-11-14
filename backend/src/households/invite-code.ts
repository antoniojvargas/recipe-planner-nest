import { createHash, randomInt } from 'node:crypto';

/** Alfabeto sin caracteres ambiguos (0/O, 1/I/L). */
const INVITE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const INVITE_CODE_LENGTH = 8;
export const INVITE_CODE_TTL_MS = 48 * 60 * 60 * 1000;

/** Genera un código de invitación legible de 8 caracteres. */
export function generateInviteCode(): string {
  let code = '';

  for (let index = 0; index < INVITE_CODE_LENGTH; index += 1) {
    code += INVITE_CODE_ALPHABET[randomInt(INVITE_CODE_ALPHABET.length)];
  }

  return code;
}

/** Hash determinista del código; es lo único que se persiste. */
export function hashInviteCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/** Normaliza el código recibido para tolerar minúsculas y espacios accidentales. */
export function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase();
}
