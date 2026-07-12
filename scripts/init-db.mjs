// One-shot schema setup for the analytics DB.
// Run locally after the Neon/Postgres env var is available:
//   vercel env pull .env.local   (or export DATABASE_URL=...)
//   node scripts/init-db.mjs
import { neon } from '@neondatabase/serverless';

const connStr =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING;

if (!connStr) {
  console.error('No DATABASE_URL / POSTGRES_URL in env. Run `vercel env pull .env.local` first.');
  process.exit(1);
}

const sql = neon(connStr);

const ddl = [
  `create table if not exists events (
     id           bigint generated always as identity primary key,
     ts           timestamptz not null default now(),
     sid          text,
     event        text not null,
     path         text,
     referrer     text,
     country      text,
     region       text,
     city         text,
     device       text,
     browser      text,
     os           text,
     screen_w     int,
     screen_h     int,
     viewport_w   int,
     viewport_h   int,
     lang         text,
     tz           text,
     utm_source   text,
     utm_medium   text,
     utm_campaign text,
     props        jsonb
   )`,
  `create index if not exists events_ts_idx on events (ts)`,
  `create index if not exists events_event_idx on events (event)`,
  `create index if not exists events_country_idx on events (country)`,
  `create index if not exists events_sid_idx on events (sid)`,
];

for (const stmt of ddl) {
  await sql.query(stmt);
}
const [{ count }] = await sql`select count(*)::int as count from events`;
console.log(`events table ready. current row count: ${count}`);
