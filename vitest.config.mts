import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

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
      include: ['tests/unit/**/*.test.{ts,tsx}'],
      env,
      pool: 'vmThreads',
      minWorkers: 1,
      maxWorkers: 1,
      isolate: false,
      fileParallelism: false,
    },
  }
})
