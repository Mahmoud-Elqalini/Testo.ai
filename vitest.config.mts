import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode ?? 'test', process.cwd(), ['NEXT_PUBLIC_', 'SUPABASE_'])

  return {
    plugins: [react()],
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./tests/unit/setup.ts'],
      include: ['tests/unit/**/*.test.{ts,tsx}'],
      env,
      pool: 'vmThreads',
      poolOptions: {
        vmThreads: {
          singleThread: true
        }
      },
      isolate: false,
      fileParallelism: false,
    },
  }
})
