import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  server: {
    port: 5173,
    open: true
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: 'index.html',
        customer: 'customer.html',
        driver: 'driver.html',
        admin: 'admin.html'
      }
    }
  }
});
