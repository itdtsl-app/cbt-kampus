import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Lokal: base '/'. Di GitHub Pages, workflow mengisi VITE_BASE='/nama-repo/'.
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
})
