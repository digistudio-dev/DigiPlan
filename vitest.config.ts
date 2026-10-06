import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// Les tests utilisent le fuseau du Maroc pour reproduire le comportement en production.
process.env.TZ = 'Africa/Casablanca'

export default defineConfig({
  resolve: {
    alias: { '@shared': resolve(__dirname, 'src/shared') }
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node'
  }
})
