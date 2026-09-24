// ESLint flat config.
//
// `npm run lint` was declared in package.json from the Vite template but no
// config file was ever committed, so the script failed outright rather than
// reporting anything. This restores it.
//
// The repo has five kinds of JavaScript, each with a different runtime, and a
// single blanket config would report the wrong globals as undefined in four of
// them:
//   src/**              browser + React, type-checked separately by `tsc -b`
//   netlify/functions/  Netlify's server runtime, with the `Netlify` global
//   tests/**            Node, CommonJS-style __dirname under Vitest
//   scripts/*.mjs       Node ESM
//   public/*.js         plain ES5 IIFEs, no build step, shipped as-is
//   google-apps-script.js  the Apps Script runtime (V8), its own globals
//
// google-apps-script.js and public/*.js are the two files with no compiler in
// front of them at all, so they are the ones that benefit from this most. They
// are deliberately NOT ignored.

import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

// Conventions this codebase already follows, encoded once rather than repeated
// per block:
//
// - A leading underscore means "required by the signature, deliberately unused".
//   Netlify hands every handler (req, context) whether or not it wants them.
// - An unused binding in `catch` is the normal shape here. Half the error
//   handling in this repo exists purely to swallow a failure that must not
//   break a lead submit, so `catch (e) {}` is the intent, not an oversight.
const UNUSED = {
  args: 'after-used',
  argsIgnorePattern: '^_',
  varsIgnorePattern: '^_',
  caughtErrors: 'none',
};

export default tseslint.config(
  {
    // Build output, dependencies, and the local `netlify dev` scratch dir
    // (which contains a whole vendored Postgres data directory).
    ignores: ['dist', 'node_modules', '.netlify'],
  },

  // ── React app ─────────────────────────────────────────────────────────────
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', UNUSED],
    },
  },

  // ── Netlify Functions ─────────────────────────────────────────────────────
  {
    files: ['netlify/functions/**/*.mts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: {
        ...globals.node,
        // Injected by the Netlify runtime; this is where every secret is read
        // from, so it must not be flagged as undefined.
        Netlify: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', UNUSED],
    },
  },

  // ── Tests ─────────────────────────────────────────────────────────────────
  {
    files: ['tests/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: {
        ...globals.node,
        // Vitest supplies these to a module even under ESM.
        __dirname: 'readonly',
        require: 'readonly',
      },
    },
    rules: {
      // The Apps Script and attribution harnesses build fake Sheets/GAS objects
      // whose shapes are genuinely dynamic, and typing them adds nothing to
      // what the test asserts.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', UNUSED],
    },
  },

  // ── Build scripts ─────────────────────────────────────────────────────────
  {
    files: ['scripts/**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      'no-unused-vars': ['error', UNUSED],
    },
  },

  // ── Static client scripts (no build step) ─────────────────────────────────
  {
    files: ['public/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      // ES5 on purpose: these are served verbatim to the browser and are also
      // eval'd by the tests. `var`, IIFEs and `new Function` are not mistakes
      // here.
      ecmaVersion: 5,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        // email-suggest.js is dual-target: the browser loads it via <script>,
        // and the tests eval it and read module.exports. It also falls back to
        // globalThis when there is no window, which ES5 does not know about.
        module: 'readonly',
        globalThis: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', UNUSED],
    },
  },

  // ── Google Apps Script ────────────────────────────────────────────────────
  {
    files: ['google-apps-script.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'script',
      globals: {
        SpreadsheetApp: 'readonly',
        PropertiesService: 'readonly',
        UrlFetchApp: 'readonly',
        CacheService: 'readonly',
        LockService: 'readonly',
        ScriptApp: 'readonly',
        ContentService: 'readonly',
        MailApp: 'readonly',
        Logger: 'readonly',
      },
    },
    rules: {
      // The file is one flat script of top-level declarations that the Apps
      // Script runtime calls by name (doPost, processFollowUps, the trigger
      // installers), and that the tests pull out by name. Nothing here is
      // unused from the runtime's point of view.
      'no-unused-vars': 'off',
      // `try { ... } catch (e) {}` around a best-effort read. The empty block is
      // the handling: the caller has a fallback and must not be interrupted.
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
);
