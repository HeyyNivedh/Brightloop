const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const EmbeddedPostgres = require('embedded-postgres').default;

const port = parseInt(process.env.DB_PORT || '54333', 10);
const user = process.env.DB_USER || 'postgres';
const password = process.env.DB_PASSWORD || 'postgres';
const initialDatabase = process.env.DB_NAME || 'brightloop';
const databaseDir = path.resolve(__dirname, '../.data/postgres');

async function isPostgresReady(port) {
  const client = new Client({
    host: '127.0.0.1',
    port,
    user,
    password,
    database: initialDatabase,
    connectionTimeoutMillis: 1500,
  });

  try {
    await client.connect();
    await client.query('SELECT 1');
    await client.end();
    return true;
  } catch (err) {
    return false;
  }
}

async function startServer() {
  const ready = await isPostgresReady(port);
  if (ready) {
    console.log(`[DB Runner] PostgreSQL is already running and ready on port ${port}.`);
    return;
  }

  if (!fs.existsSync(databaseDir)) {
    fs.mkdirSync(databaseDir, { recursive: true });
  }

  console.log(`[DB Runner] Starting Embedded PostgreSQL on port ${port}...`);
  console.log(`[DB Runner] Data directory: ${databaseDir}`);

  const pg = new EmbeddedPostgres({
    port,
    databaseDir,
    user,
    password,
    initialDatabase,
    persistent: true,
  });

  try {
    await pg.initialise();
  } catch (err) {
    // If already initialized, ignore
  }

  await pg.start();

  // Ensure initial database exists
  try {
    const adminClient = new Client({
      host: '127.0.0.1',
      port,
      user,
      password,
      database: 'postgres',
      connectionTimeoutMillis: 3000,
    });
    await adminClient.connect();
    const res = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [initialDatabase]);
    if (res.rowCount === 0) {
      await adminClient.query(`CREATE DATABASE "${initialDatabase}"`);
    }
    await adminClient.end();
  } catch (err) {
    // Ignore or log error if already exists
  }

  console.log(`[DB Runner] PostgreSQL started successfully on port ${port}.`);
  console.log(`[DB Runner] Database "${initialDatabase}" is ready for connections.`);

  const shutdown = async () => {
    console.log('[DB Runner] Stopping PostgreSQL...');
    try {
      await pg.stop();
    } catch (e) {}
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Keep event loop alive
  setInterval(() => {}, 60000);
}

const command = process.argv[2] || 'start';

if (command === 'start') {
  startServer().catch((err) => {
    console.error('[DB Runner] Failed to start PostgreSQL:', err);
    process.exit(1);
  });
} else if (command === 'check') {
  isPostgresReady(port).then((ready) => {
    console.log(ready ? 'READY' : 'STOPPED');
    process.exit(ready ? 0 : 1);
  });
}
