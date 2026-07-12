// PUBLIC aggregate analytics for the live "checked from around the world" map.
// Returns only anonymous, aggregate counts (no session ids, no raw rows) so it is safe
// to expose without a token. Cached for 60s at the edge.
import { neon } from '@neondatabase/serverless';

const connStr =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING;

const sql = connStr ? neon(connStr) : null;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
  if (!sql) { res.status(503).json({ error: 'db_not_configured' }); return; }
  try {
    const [totals] = await sql`
      select count(*)::int as events,
             count(distinct sid)::int as people,
             count(distinct country)::int as countries
      from events`;
    const byCountry = await sql`
      select country, count(distinct sid)::int as n
      from events where country is not null and country <> ''
      group by country order by n desc, country`;
    const byCity = await sql`
      select city, region, country, count(distinct sid)::int as n
      from events where city is not null and city <> ''
      group by city, region, country order by n desc, city limit 25`;
    const byRef = await sql`
      select referrer, count(distinct sid)::int as n
      from events where referrer is not null and referrer <> ''
      group by referrer order by n desc limit 20`;
    const calcRuns = await sql`select count(*)::int as n from events where event='calc'`;
    res.status(200).json({
      totals: { ...totals, runs: (calcRuns[0] && calcRuns[0].n) || 0 },
      byCountry, byCity, byRef,
    });
  } catch (e) {
    res.status(500).json({ error: 'db_error' });
  }
}
