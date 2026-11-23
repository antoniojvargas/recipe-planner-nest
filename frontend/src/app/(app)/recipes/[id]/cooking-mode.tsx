'use client';

import { useEffect, useRef, useState } from 'react';

interface CookingModeProps {
  title: string;
  steps: { text: string }[];
  onClose: () => void;
}

/** Forma mínima de la Wake Lock API: no todos los navegadores la exponen. */
interface ScreenWakeLock {
  request: (type: 'screen') => Promise<{ release: () => Promise<void> }>;
}

/**
 * Modo cocina: un paso a la vez, en grande y con contraste alto para poder leerlo de pie,
 * a un metro de la encimera. Los controles quedan abajo, al alcance del pulgar, y la pantalla
 * se mantiene encendida mientras el navegador lo permita.
 */
export function CookingMode({ title, steps, onClose }: CookingModeProps) {
  const [current, setCurrent] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const wakeLock = (navigator as unknown as { wakeLock?: ScreenWakeLock }).wakeLock;
    let lock: { release: () => Promise<void> } | undefined;
    void wakeLock
      ?.request('screen')
      .then((acquired) => {
        lock = acquired;
      })
      .catch(() => {
        // Si el navegador la rechaza (por ejemplo, al cambiar de pestaña), cocinar sigue funcionando.
      });

    return () => {
      document.body.style.overflow = previousOverflow;
      void lock?.release().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose();
      } else if (event.key === 'ArrowRight') {
        setCurrent((index) => Math.min(index + 1, steps.length - 1));
      } else if (event.key === 'ArrowLeft') {
        setCurrent((index) => Math.max(index - 1, 0));
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, steps.length]);

  const step = steps.at(current);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cooking-title"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col bg-pepper-900 text-white focus:outline-none"
    >
      <header className="flex items-center justify-between gap-4 border-b border-white/20 px-5 py-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-saffron-300">
            Modo cocina
          </p>
          <h2 id="cooking-title" className="truncate font-serif text-xl sm:text-2xl">
            {title}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-12 shrink-0 items-center rounded-xl border border-white/30 px-4 text-base font-medium hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-saffron-300"
        >
          Salir
        </button>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-5 py-8 text-center">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-saffron-300">
          {steps.length === 0
            ? 'Sin pasos'
            : `Paso ${String(current + 1)} de ${String(steps.length)}`}
        </p>
        <p aria-live="polite" className="text-3xl leading-snug font-medium sm:text-5xl">
          {step?.text ?? 'Esta receta todavía no tiene pasos.'}
        </p>
      </div>

      <footer className="grid grid-cols-2 gap-3 border-t border-white/20 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
        <button
          type="button"
          onClick={() => {
            setCurrent((index) => Math.max(index - 1, 0));
          }}
          disabled={current === 0}
          className="min-h-16 rounded-xl border border-white/30 text-base font-medium hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-saffron-300 disabled:opacity-40"
        >
          ← Anterior
        </button>
        <button
          type="button"
          onClick={() => {
            setCurrent((index) => Math.min(index + 1, steps.length - 1));
          }}
          disabled={current >= steps.length - 1}
          className="min-h-16 rounded-xl bg-basil-500 text-base font-medium hover:bg-basil-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-saffron-300 disabled:opacity-40"
        >
          Siguiente →
        </button>
      </footer>
    </div>
  );
}
