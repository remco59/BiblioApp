import { useEffect, useRef, useState, type FormEvent } from 'react';

interface Props {
  label: string;
  onScan: (code: string) => void | Promise<void>;
  autoFocus?: boolean;
  /** Tekst op de verzendknop, bv. "Uitlenen". */
  action?: string;
}

type DetectorCtor = new (opts: { formats: string[] }) => {
  detect(src: HTMLVideoElement): Promise<{ rawValue: string }[]>;
};

/** Handscanner (typt de code + Enter) of camera via de BarcodeDetector-API, indien beschikbaar. */
export function BarcodeInput({ label, onScan, autoFocus, action = 'Zoeken' }: Props) {
  const [value, setValue] = useState('');
  const [camera, setCamera] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const detectorSupported = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (!camera) return;
    let stream: MediaStream | undefined;
    let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const Detector = (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector;
        const detector = new Detector({ formats: ['code_128', 'ean_13', 'qr_code'] });
        while (!stopped) {
          const found = await detector.detect(video.current);
          if (found[0]) {
            setCamera(false);
            await onScan(found[0].rawValue);
            return;
          }
          await new Promise((r) => setTimeout(r, 250));
        }
      } catch {
        setCamera(false);
      }
    })();
    return () => {
      stopped = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [camera, onScan]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const code = value.trim();
    if (!code) return;
    setValue('');
    await onScan(code);
    input.current?.focus();
  }

  return (
    <form onSubmit={submit} className="scan">
      <label className="field grow">
        <span>{label}</span>
        <input
          ref={input}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <button type="submit">{action}</button>
      {detectorSupported && (
        <button type="button" className="secondary" onClick={() => setCamera(!camera)}>
          {camera ? 'Camera uit' : 'Scannen met camera'}
        </button>
      )}
      {camera && (
        <video ref={video} className="scan-video" muted playsInline aria-label="Camerabeeld" />
      )}
    </form>
  );
}
