import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  // TODO(debt): remover — issue #42
  {
    files: [
      'src/pages/Organization/OrganizationDetailPage.tsx',
      'src/pages/Organization/OrganizationPage.tsx',
      'src/pages/Organization/ServiceDetailPage.tsx',
      'src/pages/Organization/TeamPage.tsx',
      'src/pages/Repertoire/RepertoireDetailPage.tsx',
      'src/pages/Repertoire/RepertoireListPage.tsx',
      'src/pages/Stage/BandStagePage.tsx',
      'src/pages/Stage/ServiceStagePage.tsx',
    ],
    rules: {
      'react-hooks/set-state-in-effect': 'off',
    },
  },
])
