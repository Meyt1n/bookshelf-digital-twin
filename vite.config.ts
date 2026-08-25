import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 固定端口，避免与本机其他 vite 项目（5173/5174 等）互相抢占
    port: 5188,
    // 监听所有地址：允许用 127.0.0.1 打开（与 Flask 登录 Cookie 同域，联机必需），也方便局域网设备访问
    host: true,
    proxy: {
      // 联机模式：把 /api 代理到 bookshelf 主项目的 Flask 服务
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three'
          if (id.includes('node_modules/@react-three')) return 'r3f'
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
            return 'react-vendor'
          }
          return undefined
        },
      },
    },
  },
})
