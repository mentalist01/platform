module.exports = {
  apps: [
    {
      name: 'ege',
      cwd: __dirname,
      script: './server/index.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      time: true,
      env: {
        NODE_ENV: 'production',
        PORT: '5175',
        APP_ALLOWED_ORIGINS: 'http://localhost,capacitor://localhost,ionic://localhost',
        AUTH_COOKIE_SAME_SITE: 'None',
        AUTH_COOKIE_SECURE: 'true',
        PLATFORM_DATA_DIR: '/root/platform-data',
        PLATFORM_UPLOADS_DIR: '/root/platform-uploads',
        PLATFORM_COLLAB_DIR: '/root/platform-collab',
        COLLAB_PERSISTENCE: '1',
        BOARD_COLLAB_SNAPSHOT_PERSISTENCE: '1',
        BOARD_COLLAB_SNAPSHOT_WRITE_DEBOUNCE_MS: '10000',
        AUTH_SESSION_PERSIST_MIN_EXTENSION_MS: '900000',
      },
    },
  ],
};
