import type { Namespace } from 'socket.io';
import type { RedisClient } from '../redis/redis.module.js';
import { RealtimePublisherService } from './realtime-publisher.service.js';

interface Harness {
  service: RealtimePublisherService;
  publishToRedis: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  to: ReturnType<typeof vi.fn>;
  attach: () => void;
}

function createService(attach = false): Harness {
  const publishToRedis = vi.fn().mockResolvedValue(1);
  const emit = vi.fn();
  const to = vi.fn().mockReturnValue({ emit });
  const service = new RealtimePublisherService({
    publish: publishToRedis,
  } as unknown as RedisClient);

  if (attach) {
    service.attach({ to } as unknown as Namespace);
  }

  return {
    service,
    publishToRedis,
    emit,
    to,
    attach: () => {
      service.attach({ to } as unknown as Namespace);
    },
  };
}

const payload = {
  householdId: 'home-1',
  weekStart: '2026-11-16',
  itemId: 'item-1',
  checked: true,
  checkedBy: { userId: 'user-1', displayName: 'Ana' },
  quantity: 2,
  unit: 'kg' as const,
  version: 3,
};

describe('RealtimePublisherService', () => {
  it('emite a la sala del hogar por el namespace del gateway cuando está adjunto', () => {
    const { service, to, emit, publishToRedis } = createService(true);

    service.publish('shopping.item.updated', payload);

    expect(to).toHaveBeenCalledWith('household:home-1');
    expect(emit).toHaveBeenCalledWith('shopping.item.updated', payload);
    expect(publishToRedis).not.toHaveBeenCalled();
  });

  it('sin gateway publica en el canal de Redis del namespace /realtime', () => {
    const { service, publishToRedis } = createService();

    service.publish('shopping.list.regenerated', {
      householdId: 'home-1',
      weekStart: '2026-11-16',
      version: 4,
    });

    expect(publishToRedis).toHaveBeenCalledOnce();
    const [channel] = publishToRedis.mock.calls[0] as [string, string];

    expect(channel).toBe('socket.io#/realtime#household:home-1#');
  });

  it('registra y traga los fallos al emitir: la escritura ya está confirmada', () => {
    const { service, to } = createService(true);

    to.mockImplementation(() => {
      throw new Error('namespace cerrado');
    });

    expect(() => {
      service.publish('meal-plan.updated', {
        householdId: 'home-1',
        weekStart: '2026-11-16',
        slots: [],
      });
    }).not.toThrow();
  });

  it('adjunta el namespace una sola vez y sigue emitiendo por él', () => {
    const { service, attach, to } = createService();
    attach();

    service.publish('meal-plan.updated', {
      householdId: 'home-2',
      weekStart: '2026-11-16',
      slots: [],
    });

    expect(to).toHaveBeenCalledWith('household:home-2');
  });
});
