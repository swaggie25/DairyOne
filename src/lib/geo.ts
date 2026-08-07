/** Browser geolocation helper with a safe timeout and no throwing. */
export type Coords = { lat: number | null; lng: number | null; accuracy: number | null };

export const NO_COORDS: Coords = { lat: null, lng: null, accuracy: null };

export function getCoords(timeoutMs = 8000): Promise<Coords> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(NO_COORDS);
  }
  return new Promise((resolve) => {
    let settled = false;
    const done = (c: Coords) => {
      if (!settled) {
        settled = true;
        resolve(c);
      }
    };
    navigator.geolocation.getCurrentPosition(
      (p) =>
        done({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy ?? null,
        }),
      () => done(NO_COORDS),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 15_000 },
    );
    setTimeout(() => done(NO_COORDS), timeoutMs + 500);
  });
}
