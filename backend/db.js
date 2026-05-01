import { Client, Pool } from 'pg';
import { DATABASE } from './config.js';

const quoteIdentifier = (name) => {
  if (!/^[a-z0-9_]+$/.test(name)) {
    throw new Error('Invalid database name format.');
  }
  return `"${name}"`;
};

const createConnectionOptions = (databaseName, databaseConfig = DATABASE) => {
  return {
    host: databaseConfig.IP,
    port: databaseConfig.PORT,
    database: databaseName,
    user: databaseConfig.USERNAME,
    password: databaseConfig.PASSWORD,
  };
};

const ensureDatabaseExists = async (databaseConfig = DATABASE) => {
  const adminClient = new Client(createConnectionOptions('postgres', databaseConfig));
  await adminClient.connect();
  try {
    const result = await adminClient.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [databaseConfig.DATABASE_NAME],
    );
    if (result.rowCount === 0) {
      await adminClient.query(`CREATE DATABASE ${quoteIdentifier(databaseConfig.DATABASE_NAME)}`);
    }
  } finally {
    await adminClient.end();
  }
};

const openDatabase = async (databaseConfig = DATABASE) => {
  await ensureDatabaseExists(databaseConfig);
  const pool = new Pool(createConnectionOptions(databaseConfig.DATABASE_NAME, databaseConfig));
  const db = {
    query: (sql, params = []) => pool.query(sql, params),
    withTransaction: async (action) => {
      const client = await pool.connect();
      const txDb = {
        query: (sql, params = []) => client.query(sql, params),
      };
      try {
        await client.query('BEGIN');
        await action(txDb);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    close: async () => pool.end(),
    info: {
      host: databaseConfig.IP,
      port: databaseConfig.PORT,
      database: databaseConfig.DATABASE_NAME,
    },
  };
  return db;
};

const toPostgresSql = (sql) => {
  let nextIndex = 0;
  return `${sql}`.replace(/\?/g, () => {
    nextIndex += 1;
    return `$${nextIndex}`;
  });
};

const run = async (db, sql, params = []) => {
  const pgSql = toPostgresSql(sql);
  const result = await db.query(pgSql, params);
  return {
    changes: result.rowCount ?? 0,
  };
};

const get = async (db, sql, params = []) => {
  const pgSql = toPostgresSql(sql);
  const result = await db.query(pgSql, params);
  return result.rows?.[0] ?? null;
};

const all = async (db, sql, params = []) => {
  const pgSql = toPostgresSql(sql);
  const result = await db.query(pgSql, params);
  return result.rows ?? [];
};

const close = async (db) => {
  if (!db?.close) return;
  await db.close();
};

export { openDatabase, run, get, all, close };
