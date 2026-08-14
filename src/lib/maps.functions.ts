import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const pointSchema = z.object({ lat: z.number(), lng: z.number() });

const routeInput = z.object({
  origin: pointSchema,
  destination: pointSchema,
  waypoints: z.array(pointSchema).max(23).optional(),
});

export type RouteDirections = {
  polyline: string;
  distanceMeters: number;
  durationSeconds: number;
  legs: { distanceMeters: number; durationSeconds: number }[];
};

/** Computes a driving route (Google Routes API) through the given stops. */
export const computeRoute = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => routeInput.parse(input))
  .handler(async ({ data }): Promise<RouteDirections> => {
    const mapsKey = process.env["GOOGLE_MAPS_API_KEY"];
    if (!mapsKey) throw new Error("GOOGLE_MAPS_API_KEY is not set on the server.");

    const toWaypoint = (p: { lat: number; lng: number }) => ({
      location: { latLng: { latitude: p.lat, longitude: p.lng } },
    });

    const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "X-Goog-Api-Key": mapsKey,
        "Content-Type": "application/json",
        "X-Goog-FieldMask":
          "routes.polyline.encodedPolyline,routes.distanceMeters,routes.duration,routes.legs.distanceMeters,routes.legs.duration",
      },
      body: JSON.stringify({
        origin: toWaypoint(data.origin),
        destination: toWaypoint(data.destination),
        intermediates: (data.waypoints ?? []).map(toWaypoint),
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
      }),
    });

    if (response.status === 403) {
      const details: Array<{ reason?: string }> =
        (await response.json())?.error?.details ?? [];
      const reason = details.find((d) => d.reason)?.reason;
      if (reason === "API_KEY_HTTP_REFERRER_BLOCKED") {
        throw new Error(
          'Google Maps server key is referrer-restricted. In Google Cloud Console, set the server key\'s application restrictions to "None" or "IP addresses".',
        );
      }
      if (reason === "API_KEY_SERVICE_BLOCKED") {
        throw new Error(
          "Google Maps server key does not allow the Routes API. Add it to the server key's allowed-APIs list.",
        );
      }
      throw new Error("Google Maps request was denied (403). Check the server key restrictions.");
    }

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Routes request failed [${response.status}]: ${errorBody}`);
    }

    const json = (await response.json()) as {
      routes?: Array<{
        polyline?: { encodedPolyline?: string };
        distanceMeters?: number;
        duration?: string;
        legs?: Array<{ distanceMeters?: number; duration?: string }>;
      }>;
    };

    const route = json.routes?.[0];
    if (!route?.polyline?.encodedPolyline) throw new Error("No driving route found for these stops.");

    const secs = (d?: string) => Number(String(d ?? "0s").replace("s", "")) || 0;

    return {
      polyline: route.polyline.encodedPolyline,
      distanceMeters: route.distanceMeters ?? 0,
      durationSeconds: secs(route.duration),
      legs: (route.legs ?? []).map((l) => ({
        distanceMeters: l.distanceMeters ?? 0,
        durationSeconds: secs(l.duration),
      })),
    };
  });
