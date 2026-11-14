/** Reloj inyectable para hacer deterministas la emisión y la rotación de sesiones. */
export interface AuthClock {
  now(): Date;
}

export const AUTH_CLOCK = Symbol('AUTH_CLOCK');

export const systemAuthClock: AuthClock = {
  now: () => new Date(),
};
