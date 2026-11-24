// Same-origin ISS position. Visitors only talk to this site; the server talks to the public APIs,
// so a visitor's network blocking a third-party host can't break the live panel.
export async function getIss() {
  try {
    const r = await fetch('https://api.wheretheiss.at/v1/satellites/25544', { signal: AbortSignal.timeout(4000) });
    if (r.ok) {
      const d = await r.json();
      return { lat: d.latitude, lon: d.longitude, alt: d.altitude, vel: d.velocity, sun: d.visibility };
    }
  } catch { /* fall through to the backup source */ }
  const r = await fetch('http://api.open-notify.org/iss-now.json', { signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error(`open-notify ${r.status}`);
  const d = await r.json();
  // open-notify only gives the ground track; altitude and speed stay null and the UI shows typical values
  return { lat: Number(d.iss_position.latitude), lon: Number(d.iss_position.longitude), alt: null, vel: null, sun: null };
}

export async function GET() {
  try {
    const data = await getIss();
    if (!Number.isFinite(data.lat) || !Number.isFinite(data.lon)) throw new Error('bad data');
    return Response.json(data, { headers: { 'Cache-Control': 'public, s-maxage=4, stale-while-revalidate=10' } });
  } catch {
    return Response.json({ error: 'unavailable' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
