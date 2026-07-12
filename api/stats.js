// Token-guarded analytics summary endpoint. Returns aggregate counts only
// (no raw event rows), so it never exposes individual-level data.
//   GET /api/stats?token=STATS_TOKEN
//   GET /api/stats?token=STATS_TOKEN&purge_test=1   -> deletes rows where sid like 'test-%'
import { neon } from '@neondatabase/serverless';

const connStr =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING;

const sql = connStr ? neon(connStr) : null;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const token = (req.query && req.query.token) || '';
  if (!process.env.STATS_TOKEN || token !== process.env.STATS_TOKEN) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  if (!sql) {
    res.status(503).json({ error: 'db_not_configured' });
    return;
  }

  try {
    // Owner-only maintenance (token already checked above):
    //   ?purge=test  -> delete verification rows (sid like 'test-%' or 'browser-%')
    //   ?purge=all   -> wipe every event (fresh start)
    const purge = req.query && req.query.purge;
    if (purge === 'test') {
      const del = await sql`delete from events where sid like 'test-%' or sid like 'browser-%' returning id`;
      res.status(200).json({ purged_rows: del.length });
      return;
    }
    if (purge === 'all') {
      const del = await sql`delete from events returning id`;
      res.status(200).json({ purged_rows: del.length });
      return;
    }

    const [totals] = await sql`select count(*)::int as total,
      count(distinct sid)::int as sessions,
      count(*) filter (where ts > now() - interval '24 hours')::int as last_24h,
      min(ts) as first_event, max(ts) as last_event from events`;
    const byEvent = await sql`select event, count(*)::int as n from events group by event order by n desc`;
    const byCountry = await sql`select coalesce(country,'??') as country, count(*)::int as n
      from events group by country order by n desc limit 20`;
    const byDevice = await sql`select coalesce(device,'unknown') as device, count(*)::int as n
      from events group by device order by n desc`;
    const byProduct = await sql`select coalesce(props->>'product','n/a') as product, count(*)::int as n
      from events where event in ('calc','share','download','copy') group by props->>'product' order by n desc`;

    res.status(200).json({
      totals,
      by_event: byEvent,
      by_country: byCountry,
      by_device: byDevice,
      by_product: byProduct,
    });
  } catch (e) {
    res.status(500).json({ error: 'db_error', detail: String(e && e.message || e).slice(0, 200) });
  }
}
