import { readCookie } from './cookie-header.js';

describe('readCookie', () => {
  it('extrae la cookie pedida entre varias', () => {
    const header = 'theme=dark; access_token=header.payload.signature; refresh_token=opaque';

    expect(readCookie(header, 'access_token')).toBe('header.payload.signature');
  });

  it('devuelve undefined cuando la cookie no viaja', () => {
    expect(readCookie('theme=dark', 'access_token')).toBeUndefined();
    expect(readCookie(undefined, 'access_token')).toBeUndefined();
    expect(readCookie('', 'access_token')).toBeUndefined();
  });

  it('devuelve undefined cuando la cookie está vacía', () => {
    expect(readCookie('access_token=', 'access_token')).toBeUndefined();
  });

  it('no confunde una cookie cuyo nombre termina igual', () => {
    expect(readCookie('old_access_token=otro', 'access_token')).toBeUndefined();
  });

  it('decodifica el valor y tolera espacios alrededor del nombre', () => {
    expect(readCookie(' access_token = a%2Bb ', 'access_token')).toBe('a+b');
  });

  it('usa el valor crudo si la codificación es inválida', () => {
    expect(readCookie('access_token=100%', 'access_token')).toBe('100%');
  });
});
