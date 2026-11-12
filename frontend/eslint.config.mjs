import { FlatCompat } from '@eslint/eslintrc';
import globals from 'globals';
import base from '../eslint.config.mjs';

/**
 * El frontend parte de la base compartida y añade las reglas de Next. Se mantiene
 * `FlatCompat` porque `eslint-config-next` 15 todavía publica configuración en el
 * formato antiguo.
 */
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const eslintConfig = [
  ...base,
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
];

export default eslintConfig;
