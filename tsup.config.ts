import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/main.ts', 'src/refactool.ts'],
  clean: true,
  format: ['cjs', 'esm'],
  external: ['vscode'],
  sourcemap: true,
  esbuildOptions(options) {
    options.mangleProps = /[^_]_$/
  },
})
