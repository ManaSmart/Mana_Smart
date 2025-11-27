import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  // Use absolute paths for Hostinger root deployment
  // Change to './' if deploying to a subdirectory
  base: '/',
  plugins: [
    react(),
    {
      name: 'copy-htaccess',
      closeBundle() {
        // Copy .htaccess to dist folder after build
        try {
          copyFileSync(join(__dirname, '.htaccess'), join(__dirname, 'dist', '.htaccess'))
          console.log('✓ .htaccess copied to dist folder')
        } catch (error) {
          console.warn('⚠ Could not copy .htaccess (file may not exist or already copied)')
        }
      }
    }
  ],
  build: {
    // Optimize for performance
    minify: 'esbuild', // Faster than terser
    cssMinify: true,
    sourcemap: false, // Disable in production for smaller bundles
    // Let Vite handle chunking automatically to avoid circular dependencies
    chunkSizeWarningLimit: 1000,
    // Optimize chunk loading
    target: 'esnext',
    modulePreload: {
      polyfill: false, // Modern browsers don't need polyfill
    },
    // Ensure assets are properly referenced
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        // Ensure consistent asset naming
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
  // Optimize dev server
  server: {
    hmr: true,
  },
  // Optimize dependencies
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-redux'],
  },
})
