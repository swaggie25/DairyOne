import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeScan } from "@/lib/qr";

/**
 * Camera QR scanner with a manual-entry fallback (cameras are unreliable in
 * the field). Loads html5-qrcode only in the browser, after mount.
 */
export function QrScanner({
  onResult,
  onClose,
}: {
  onResult: (code: string) => void;
  onClose?: () => void;
}) {
  const containerId = useRef(`qr-${Math.random().toString(36).slice(2)}`).current;
  const [manual, setManual] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let scanner: { stop: () => Promise<void>; clear: () => void } | null = null;

    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        const instance = new Html5Qrcode(containerId);
        scanner = instance as unknown as typeof scanner;
        await instance.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decoded) => {
            if (stopped) return;
            stopped = true;
            onResult(normalizeScan(decoded));
            void instance.stop().catch(() => {});
          },
          () => {},
        );
      } catch {
        setError("Camera unavailable — type the card code instead.");
      }
    })();

    return () => {
      stopped = true;
      void scanner?.stop().catch(() => {});
    };
  }, [containerId, onResult]);

  return (
    <div className="space-y-3">
      <div id={containerId} className="overflow-hidden rounded-xl bg-secondary" />
      {error && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Camera className="h-4 w-4" /> {error}
        </p>
      )}
      <div className="flex gap-2">
        <Input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="DO-F-F001"
          className="h-12"
          aria-label="Card code"
        />
        <Button
          className="h-12"
          onClick={() => manual.trim() && onResult(normalizeScan(manual))}
        >
          Look up
        </Button>
      </div>
      {onClose && (
        <Button variant="ghost" className="w-full" onClick={onClose}>
          <X className="h-4 w-4" /> Cancel
        </Button>
      )}
    </div>
  );
}
