const fs = require('node:fs');

const LESSON_REPLAY_S3_ENV_KEYS = new Set([
  'LESSON_REPLAY_S3_ENDPOINT',
  'LESSON_REPLAY_S3_REGION',
  'LESSON_REPLAY_S3_BUCKET',
  'LESSON_REPLAY_S3_ACCESS_KEY_ID',
  'LESSON_REPLAY_S3_SECRET_ACCESS_KEY',
  'LESSON_REPLAY_S3_PREFIX',
]);

const GOOGLE_CALENDAR_ENV_KEYS = new Set([
  'GOOGLE_CALENDAR_OAUTH_CLIENT_ID',
  'GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET',
  'GOOGLE_CALENDAR_OAUTH_REDIRECT_URI',
  'GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY',
]);

const readSecretEnv = (filePath, allowedKeys) => {
  try {
    const env = {};
    for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const separatorIndex = line.indexOf('=');
      if (separatorIndex <= 0) continue;

      const key = line.slice(0, separatorIndex).trim();
      if (!allowedKeys.has(key)) continue;

      let value = line.slice(separatorIndex + 1).trim();
      if (
        value.length >= 2
        && ((value.startsWith('"') && value.endsWith('"'))
          || (value.startsWith("'") && value.endsWith("'")))
      ) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
    return env;
  } catch (error) {
    if (error?.code === 'ENOENT') return {};
    throw error;
  }
};

const lessonReplayS3Env = readSecretEnv(
  process.env.PLATFORM_S3_ENV_FILE || '/root/platform-secrets/lesson-replay-s3.env',
  LESSON_REPLAY_S3_ENV_KEYS
);
const googleCalendarEnv = readSecretEnv(
  process.env.GOOGLE_CALENDAR_ENV_FILE || '/root/platform-secrets/google-calendar.env',
  GOOGLE_CALENDAR_ENV_KEYS
);

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
        ...lessonReplayS3Env,
        ...googleCalendarEnv,
        NODE_ENV: 'production',
        PORT: '5175',
        APP_PUBLIC_URL: 'https://ivan100.ru',
        APP_ALLOWED_ORIGINS: 'http://localhost,capacitor://localhost,ionic://localhost',
        AUTH_COOKIE_SAME_SITE: 'None',
        AUTH_COOKIE_SECURE: 'true',
        PLATFORM_DATA_DIR: '/root/platform-data',
        PLATFORM_UPLOADS_DIR: '/root/platform-uploads',
        PLATFORM_COLLAB_DIR: '/root/platform-collab',
        LEARNING_GROUPS_ENABLED: '1',
        LEARNING_GROUP_RTC_ENABLED: '0',
        COLLAB_PERSISTENCE: '1',
        BOARD_COLLAB_SNAPSHOT_PERSISTENCE: '1',
        BOARD_COLLAB_SNAPSHOT_WRITE_DEBOUNCE_MS: '60000',
        AUTH_SESSION_PERSIST_MIN_EXTENSION_MS: '900000',
        PYTHON_RUN_TIMEOUT_MS: '3000',
        PYTHON_RUN_TOTAL_TIMEOUT_MS: '8000',
        PYTHON_RUN_MAX_CONCURRENT: '1',
        PYTHON_RUN_MAX_QUEUE: '6',
        PYTHON_RUN_RATE_LIMIT: '6',
        PYTHON_RUN_RATE_WINDOW_MS: '60000',
      },
    },
  ],
};
