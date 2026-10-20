import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(() => {
  return {
    base: '/',
    // Variables desde el .env global del monorepo; solo VITE_* llega al navegador.
    envDir: path.resolve(__dirname, '../..'),
    plugins: [
      tailwindcss(),
      react()
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "next/navigation": path.resolve(__dirname, "./src/lib/next-compat.tsx"),
        "next/link": path.resolve(__dirname, "./src/lib/next-compat.tsx"),
      },
    },
  }
})
