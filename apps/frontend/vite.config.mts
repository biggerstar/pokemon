import { defineConfig } from '@vben/vite-config';
import path from 'path';

export default defineConfig(async () => {
  return {
    application: {},
    vite: {
      base: './',
      resolve: {
        alias: {
          '#': path.resolve(process.cwd(), 'src')
        }
      }
    },
  };
}, 'application');
