import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const normalizeBasePath = (rawBasePath) => {
  const trimmed = `${rawBasePath ?? ''}`.trim()
  if (!trimmed || trimmed === '/') {
    return '/'
  }
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`
}

const appBasePath = normalizeBasePath(process.env.VITE_APP_BASE_PATH)

export default defineConfig({
  base: appBasePath,
  plugins: [react({ include: /\.(jsx|js)$/ })],
  build: {
    outDir: 'build',
    emptyOutDir: true,
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
      },
    },
  },
})
