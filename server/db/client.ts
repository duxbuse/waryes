/**
 * Database client connection using Drizzle ORM + postgres.js
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required');
}

// Create postgres.js client
const client = postgres(databaseUrl, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

// Create Drizzle ORM instance with schema
export const db = drizzle(client, { schema });

// Export for direct SQL queries if needed
export { client as pgClient };
