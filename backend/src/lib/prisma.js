const { PrismaClient } = require('@prisma/client');

// Singleton PrismaClient — shared across all route files.
// pgbouncer=true disables prepared statements (required for Supabase PgBouncer in transaction mode).
// connection_limit=1 prevents "too many connections" on free-tier Supabase.
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error('DATABASE_URL is not set — refusing to start with an empty database URL.');
}
const separator = dbUrl.includes('?') ? '&' : '?';
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: dbUrl + separator + 'pgbouncer=true&connection_limit=1',
    },
  },
});

module.exports = prisma;
