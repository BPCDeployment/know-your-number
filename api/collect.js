// First-party analytics ingestion endpoint.
// Receives usage events from the app (consent-gated on the client) and writes them
// to Postgres. No personal identifiers are collected; geo is coarse (country/region/city)
// and derived server-side from Vercel's edge headers, never trusted from the client.
import { neon } from '@neondatabase/serverless';

const connStr =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING;

const sql = connStr ? neon(connStr) : null;

// Ensure the events table exists. Memoized so the DDL runs at most once per
// warm function instance (idempotent CREATE ... IF NOT EXISTS on cold start).
let schemaReady = null;
function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        create table if not exists events (
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
        )`;
      await sql`create index if not exists events_ts_idx on events (ts)`;
      await sql`create index if not exists events_event_idx on events (event)`;
      await sql`create index if not exists events_country_idx on events (country)`;
    })().catch((e) => { schemaReady = null; throw e; });
  }
  return schemaReady;
}

const ALLOWED = new Set([
  'pageview', 'calc', 'click', 'share', 'copy',
  'download', 'preset', 'theme', 'view', 'resource', 'outbound',
]);

function clip(v, n) {
  if (v == null) return null;
  const s = String(v);
  return s.length > n ? s.slice(0, n) : s;
}
function intOrNull(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}
function readRaw(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', (c) => {
      d += c;
      if (d.length > 16000) reject(new Error('payload too large'));
    });
    req.on('end', () => resolve(d));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  if (!sql) {
    res.status(503).json({ error: 'db_not_configured' });
    return;
  }

  let body = req.body;
  if (!body || typeof body === 'string') {
    try {
      const raw = typeof body === 'string' ? body : await readRaw(req);
      body = raw ? JSON.parse(raw) : {};
    } catch (e) {
      res.status(400).json({ error: 'bad_json' });
      return;
    }
  }

  const event = clip(body.event, 32);
  if (!event || !ALLOWED.has(event)) {
    res.status(400).json({ error: 'bad_event' });
    return;
  }

  // Coarse geo, derived server-side from Vercel edge headers (not client-supplied).
  const h = req.headers;
  const country = clip(h['x-vercel-ip-country'], 8);
  const region = clip(h['x-vercel-ip-country-region'], 16);
  let city = h['x-vercel-ip-city'] || null;
  try { city = city ? decodeURIComponent(city) : null; } catch (e) { /* keep raw */ }
  city = clip(city, 96);

  let propsStr = null;
  if (body.props && typeof body.props === 'object') {
    try { propsStr = JSON.stringify(body.props).slice(0, 4000); } catch (e) { propsStr = null; }
  }

  try {
    await ensureSchema();
    await sql`
      insert into events
        (sid, event, path, referrer, country, region, city, device, browser, os,
         screen_w, screen_h, viewport_w, viewport_h, lang, tz,
         utm_source, utm_medium, utm_campaign, props)
      values
        (${clip(body.sid, 64)}, ${event}, ${clip(body.path, 256)}, ${clip(body.referrer, 256)},
         ${country}, ${region}, ${city}, ${clip(body.device, 16)}, ${clip(body.browser, 32)}, ${clip(body.os, 32)},
         ${intOrNull(body.screen_w)}, ${intOrNull(body.screen_h)}, ${intOrNull(body.viewport_w)}, ${intOrNull(body.viewport_h)},
         ${clip(body.lang, 16)}, ${clip(body.tz, 48)},
         ${clip(body.utm_source, 64)}, ${clip(body.utm_medium, 64)}, ${clip(body.utm_campaign, 64)},
         ${propsStr}::jsonb)
    `;
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: 'db_error' });
  }
}
