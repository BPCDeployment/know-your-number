// Crawler-friendly share wrapper. Serves per-score Open Graph meta (so link
// previews render the score card) then redirects real visitors into the app.
export default function handler(req, res){
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'knowyournumber.io';
  const base = 'https://' + host;
  let url;
  try { url = new URL(req.url, base); } catch(e){ url = new URL(base); }
  const p = url.searchParams;

  let s = parseInt(p.get('s'), 10);
  if(!Number.isFinite(s)) s = 100;
  s = Math.max(0, Math.min(100, s));
  const w = (p.get('w') || '').slice(0, 52);

  // Forward the scenario state to the real app.
  const keys = ['c','m','d','am','y','p','f','v','cs','chal'];
  const state = new URLSearchParams();
  keys.forEach(k => { const val = p.get(k); if(val != null && val !== '') state.set(k, val); });
  const appUrl = '/' + (state.toString() ? '?' + state.toString() : '');

  const ogImg = base + '/api/og?s=' + s + (w ? '&w=' + encodeURIComponent(w) : '');
  const title = 'My number is ' + s + ". What's yours?";
  const desc = 'Real math on smoking, vaping and drinking. See what your habits actually add up to, then check yours.';
  const esc = str => String(str).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).send(
`<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(ogImg)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${esc(base + appUrl)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(ogImg)}">
<meta http-equiv="refresh" content="0; url=${esc(appUrl)}">
<script>location.replace(${JSON.stringify(appUrl)});</script>
</head><body style="background:#0A0F13;color:#F1F7F8;font-family:sans-serif;text-align:center;padding:60px 20px;">
<p style="font-size:18px">Taking you to your number… <a style="color:#2BE3AC" href="${esc(appUrl)}">tap here if it doesn't load.</a></p>
</body></html>`
  );
}
