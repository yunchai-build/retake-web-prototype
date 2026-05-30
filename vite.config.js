import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const httpsKeyPath = path.join(rootDir, '.cert/localhost-key.pem');
const httpsCertPath = path.join(rootDir, '.cert/localhost-cert.pem');
const useLocalHttps = (
  process.env.VITE_DEV_HTTPS === '1'
  && fs.existsSync(httpsKeyPath)
  && fs.existsSync(httpsCertPath)
);

const serverConfig = {
  host: '0.0.0.0',
  port: 5174,
  strictPort: true,
  allowedHosts: ['.trycloudflare.com'],
  ...(useLocalHttps ? {
    https: {
      key: fs.readFileSync(httpsKeyPath),
      cert: fs.readFileSync(httpsCertPath),
    },
  } : {}),
};

export default defineConfig({
  plugins: [react()],
  server: serverConfig,
  build: {
    outDir: 'dist',
  },
});
