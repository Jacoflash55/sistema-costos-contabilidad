import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/*
  Mismo molde que `sistema-jacobo`, sin la parte de PWA ni la del archivo
  unico para el celular: eso se agrega despues si hace falta.

  `base: './'` —relativo, no '/'— para que el mismo build sirva en los dos
  lados: en Cloudflare, donde la app vive en la raiz, y abierto DIRECTAMENTE
  desde una carpeta o un USB con doble clic en index.html. Lo segundo es el
  plan B para exponer en un salon sin internet. Funciona porque la app usa
  HashRouter: todas las rutas son "/#/algo", asi que la pagina siempre esta en
  la raiz y las rutas relativas resuelven igual.

  Los JSON de `data/` se IMPORTAN en TypeScript (no se piden con fetch), asi
  que Vite los mete dentro del bundle y la app no hace ninguna peticion en
  tiempo de ejecucion.
*/
export default defineConfig({
  base: './',
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
