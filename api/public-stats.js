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
    // Counts are of visits (page views), so every visitor is counted, not only
    // those who opted into deeper logging.
    const [totals] = await sql`
      select count(*) filter (where event='pageview')::int as visits,
             count(distinct country) filter (where event='pageview' and country is not null and country <> '')::int as countries,
             count(*) filter (where event='calc')::int as runs
      from events`;
    const byCountry = await sql`
      select country, count(*)::int as n
      from events where event='pageview' and country is not null and country <> ''
      group by country order by n desc, country`;
    const byCity = await sql`
      select city, region, country, count(*)::int as n
      from events where event='pageview' and city is not null and city <> ''
      group by city, region, country order by n desc, city limit 25`;
    const byRef = await sql`
      select referrer, count(*)::int as n
      from events where event='pageview' and referrer is not null and referrer <> ''
      group by referrer order by n desc limit 20`;
    res.status(200).json({ totals, byCountry, byCity, byRef });
  } catch (e) {
    res.status(500).json({ error: 'db_error' });
  }
}
