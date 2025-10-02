import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    outDir: 'lib',
    lib: {
      entry: {
        'query-client': 'src/query-client.ts',
        'query-fn': 'src/query-fn.ts',
        'query-item': 'src/query-item.ts'
      },
      name: 'query-client',
      formats: ['es', 'cjs'],
      fileName: (format) => `[name].${format}.js`,
    },
    rollupOptions: {
      external: [],
      output: {
        exports: 'named',
      }
    },
    target: 'es2018',
  },
  plugins: [dts()],
});
