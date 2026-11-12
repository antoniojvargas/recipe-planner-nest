// Variables por defecto para los tests: las que ya existan (CI, compose o el shell)
// no se tocan. Así el arranque de la app en e2e valida una configuración realista
// sin depender de un `.env` local.
const testEnvironment: Record<string, string> = {
  MONGO_URL: 'mongodb://localhost:27017/recipes-test?replicaSet=rs0',
  REDIS_URL: 'redis://localhost:6379',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_PUBLIC_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'recipes-test',
  S3_ACCESS_KEY: 'minioadmin',
  S3_SECRET_KEY: 'minioadmin',
  JWT_ACCESS_SECRET: 'test-access-secret-with-32-characters-minimum',
  JWT_REFRESH_SECRET: 'test-refresh-secret-with-32-characters-minimum',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  MAIL_FROM: 'Recipe Planner <no-reply@recipe-planner.test>',
  APP_ENV: 'test',
  LOG_LEVEL: 'error',
  FRONTEND_URL: 'http://localhost:3001',
  API_INTERNAL_URL: 'http://localhost:3000',
};

for (const [name, value] of Object.entries(testEnvironment)) {
  if (process.env[name] === undefined || process.env[name] === '') {
    process.env[name] = value;
  }
}
