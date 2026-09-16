require('dotenv').config();
const { createApp } = require('./app');
const { MysqlRepository } = require('./repositories/mysqlRepository');

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variabile d'ambiente obbligatoria mancante: ${name}`);
  return value;
}

function positiveEnv(name, fallback) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} deve essere un intero positivo`);
  return value;
}

const repository = new MysqlRepository({
  host: requiredEnv('DB_HOST'),
  port: positiveEnv('DB_PORT', 3306),
  user: requiredEnv('DB_USER'),
  password: requiredEnv('DB_PASSWORD'),
  database: requiredEnv('DB_NAME'),
  connectionLimit: positiveEnv('DB_CONNECTION_LIMIT', 10)
});
const app = createApp(repository);
const port = positiveEnv('PORT', 3000);
const server = app.listen(port, () => console.log(JSON.stringify({ event: 'server_started', service: 'pof-gas-api', port })));
server.requestTimeout = 30_000;
server.headersTimeout = 35_000;
let shuttingDown;

async function shutdown() {
  if (shuttingDown) return shuttingDown;
  shuttingDown = new Promise((resolve) => {
    server.close(async () => {
      try {
        await repository.close();
        console.log(JSON.stringify({ event: 'server_stopped' }));
        resolve();
      } catch (error) {
        console.error(JSON.stringify({ event: 'shutdown_failed', error: error.message }));
        process.exitCode = 1;
        resolve();
      }
    });
  });
  return shuttingDown;
}

server.on('error', (error) => {
  console.error(JSON.stringify({ event: 'server_error', error: error.message }));
  process.exitCode = 1;
});
process.once('SIGINT', () => shutdown().then(() => process.exit()));
process.once('SIGTERM', () => shutdown().then(() => process.exit()));
