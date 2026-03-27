const { PrismaClient } = require('@prisma/client');

// Singleton PrismaClient — shared across all route files.
// pgbouncer=true disables prepared statements (required for Supabase PgBouncer in transaction mode).
// connection_limit=1 prevents "too many connections" on free-tier Supabase.
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL + '?pgbouncer=true&connection_limit=1',
    },
  },
});

module.exports = prisma;
