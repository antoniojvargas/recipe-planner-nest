import type { Namespace } from 'socket.io';
import type { RealtimeSocket } from './realtime.gateway.js';
import { RealtimeRoomsService } from './realtime-rooms.service.js';
import { householdRoom, userRoom } from './rooms.js';

interface Harness {
  service: RealtimeRoomsService;
  inRoom: ReturnType<typeof vi.fn>;
  socketsJoin: ReturnType<typeof vi.fn>;
  socketsLeave: ReturnType<typeof vi.fn>;
}

function createService(attach = true): Harness {
  const socketsJoin = vi.fn();
  const socketsLeave = vi.fn();
  const inRoom = vi.fn().mockReturnValue({ socketsJoin, socketsLeave });
  const service = new RealtimeRoomsService();

  if (attach) {
    service.attach({ in: inRoom } as unknown as Namespace);
  }

  return { service, inRoom, socketsJoin, socketsLeave };
}

describe('RealtimeRoomsService', () => {
  it('usa los nombres de sala del hogar y del usuario', () => {
    expect(householdRoom('abc')).toBe('household:abc');
    expect(userRoom('user-1')).toBe('user:user-1');
  });

  it('une todos los sockets del usuario a la sala del hogar al que entra', () => {
    const { service, inRoom, socketsJoin } = createService();

    service.onJoined('user-1', 'home-1');

    expect(inRoom).toHaveBeenCalledWith('user:user-1');
    expect(socketsJoin).toHaveBeenCalledWith('household:home-1');
  });

  it('saca todos los sockets del usuario de la sala del hogar que abandona', () => {
    const { service, inRoom, socketsLeave } = createService();

    service.onLeft('user-1', 'home-1');

    expect(inRoom).toHaveBeenCalledWith('user:user-1');
    expect(socketsLeave).toHaveBeenCalledWith('household:home-1');
  });

  it('une el socket conectado a su sala privada', async () => {
    const { service } = createService();
    const join = vi.fn().mockResolvedValue(undefined);
    const socket = {
      data: { user: { id: 'user-1', familyId: 'family-1' } },
      join,
    } as unknown as RealtimeSocket;

    await service.joinUserChannel(socket);

    expect(join).toHaveBeenCalledWith('user:user-1');
  });

  it('no falla cuando no hay gateway que haya entregado el namespace', () => {
    const { service } = createService(false);

    expect(() => {
      service.onJoined('user-1', 'home-1');
    }).not.toThrow();
  });

  it('registra y traga los fallos del adaptador: la escritura ya está confirmada', () => {
    const { service, inRoom } = createService();

    inRoom.mockImplementation(() => {
      throw new Error('Redis caído');
    });

    expect(() => {
      service.onLeft('user-1', 'home-1');
    }).not.toThrow();
  });
});
