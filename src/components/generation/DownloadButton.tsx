/**
 * DownloadButton — every download in the app routes through
 * `downloadWithBleed`, so the global 3 mm bleed is always applied,
 * even when no print format is associated with the image.
 */
import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { downloadWithBleed } from "@/lib/raw-download";

export interface DownloadButtonProps {
  url: string;
  filename: string;
  /** Optional version suffix shown in parens — e.g. "Original" or "Enhanced". */
  versionLabel?: string;
  /** Size label shown after the version, e.g. "A3" or "30x40 cm". */
  sizeLabel: string;
  /** Optional known print format id — when set, uses format trim dims. */
  printFormatId?: string | null;
  /** Optional DPI hint when no print format is known. */
  dpi?: number;
}

export default function DownloadButton({
  url,
  filename,
  versionLabel,
  sizeLabel,
  printFormatId,
  dpi,
}: DownloadButtonProps) {
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await downloadWithBleed(url, { filename, printFormatId, dpi });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={busy}
      className="font-display text-xs tracking-wider"
    >
      {busy ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Download className="mr-2 h-4 w-4" />
      )}
      Download{versionLabel ? ` (${versionLabel})` : ""} ({sizeLabel})
    </Button>
  );
}
