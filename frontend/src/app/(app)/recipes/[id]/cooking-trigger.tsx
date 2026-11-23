'use client';

import dynamic from 'next/dynamic';
import { useRef, useState } from 'react';

// El modo cocina solo se descarga cuando alguien entra en él.
const CookingMode = dynamic(() => import('./cooking-mode').then((module) => module.CookingMode));

interface CookingTriggerProps {
  title: string;
  steps: { text: string }[];
}

/** Única isla cliente del detalle: abre el modo cocina y le devuelve el foco al cerrarlo. */
export function CookingTrigger({ title, steps }: CookingTriggerProps) {
  const [cooking, setCooking] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  function closeCooking(): void {
    setCooking(false);
    buttonRef.current?.focus();
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          setCooking(true);
        }}
        className="mt-4 inline-flex min-h-12 items-center rounded-xl bg-basil-600 px-5 text-base font-medium text-white hover:bg-basil-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-basil-300 focus-visible:ring-offset-2"
      >
        Modo cocina
      </button>
      {cooking && <CookingMode title={title} steps={steps} onClose={closeCooking} />}
    </>
  );
}
