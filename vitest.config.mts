import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const mockedTests = [
  'tests/unit/components/group-invitations.test.tsx',
  'tests/unit/lib/edge-functions.test.ts',
  'tests/unit/services/dashboard.test.ts',
  'tests/unit/services/group-invitation-service.test.ts',
  'tests/unit/services/owner-field-services.test.ts',
  'tests/unit/services/preferences.test.ts',
]

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode ?? 'test', process.cwd(), ['NEXT_PUBLIC_', 'SUPABASE_'])

  return {
    plugins: [react()],
    resolve: {
      alias: { '@': path.resolve(process.cwd(), 'src') },
    },
    cacheDir: '.cache/vite',
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./tests/unit/setup.ts'],
      env,
      projects: [
        {
          extends: true,
          test: {
            name: 'mocked',
            include: mockedTests,
            pool: 'forks',
            maxWorkers: 1,
            isolate: true,
          },
        },
        {
          extends: true,
          test: {
            name: 'live',
            include: ['tests/unit/**/*.test.{ts,tsx}'],
            exclude: mockedTests,
            pool: 'vmThreads',
            maxWorkers: 1,
            isolate: false,
            fileParallelism: false,
          },
        },
      ],
    },
  }
})
