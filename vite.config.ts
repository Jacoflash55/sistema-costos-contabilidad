import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/*
  Mismo molde que `sistema-jacobo`, sin la parte de PWA ni la del archivo
  unico para el celular: eso se agrega despues si hace falta.

  `base: '/'` porque el deploy es en Cloudflare Workers como sitio estatico y
  la app usa HashRouter, asi que el servidor solo ve "/".

  Los JSON de `data/` se IMPORTAN en TypeScript (no se piden con fetch), asi
  que Vite los mete dentro del bundle y la app no hace ninguna peticion en
  tiempo de ejecucion.
*/
export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // expone el dev server en la red local
    open: true,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
