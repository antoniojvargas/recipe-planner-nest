import { requestIdAdapterOptions, resolveRequestId, REQUEST_ID_HEADER } from './request-id.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('resolveRequestId', () => {
  it('reutiliza el X-Request-Id entrante', () => {
    expect(resolveRequestId('request-id-del-proxy')).toBe('request-id-del-proxy');
  });

  it('recorta espacios del X-Request-Id entrante', () => {
    expect(resolveRequestId('  request-id-del-proxy  ')).toBe('request-id-del-proxy');
  });

  it('genera un UUID cuando la cabecera no llega', () => {
    expect(resolveRequestId(undefined)).toMatch(UUID_PATTERN);
  });

  it('genera un UUID cuando la cabecera está vacía', () => {
    expect(resolveRequestId('   ')).toMatch(UUID_PATTERN);
  });

  it('genera un UUID distinto en cada petición', () => {
    expect(resolveRequestId(undefined)).not.toBe(resolveRequestId(undefined));
  });
});

describe('requestIdAdapterOptions', () => {
  it('usa la cabecera X-Request-Id como id de Fastify', () => {
    const options = requestIdAdapterOptions();

    expect(options.genReqId({ headers: { [REQUEST_ID_HEADER]: 'abc-123' } })).toBe('abc-123');
    expect(options.genReqId({ headers: {} })).toMatch(UUID_PATTERN);
  });
});
