/**
 * Etsy mockup preview generator dialog.
 *
 * Renders 3–5 listing-ready scenes from the master asset (frame, interior,
 * close-up detail, clean background, optional size guide) and lets the user
 * download them individually or as a ZIP.
 *
 * All rendering is image-based via `lib/mockup-generator.ts` — this dialog
 * is presentation only.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Download, ImageOff, Layers, Package } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import {
  generateMockupsForImage,
  buildMockupZip,
  downloadMockupZip,
  downloadMockupResult,
  revokeMockupBundle,
  getMockupTemplates,
  type MockupBundle,
} from "@/lib/mockup-generator";
import { DEFAULT_MOCKUP_PACK_IDS } from "@/lib/mockup-templates";

export interface EtsyMockupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Master asset URL — caller must resolve via getExportSourceAssetForImage */
  masterUrl: string | null;
  /** Optional label for the source artwork (used in toasts). */
  sourceLabel?: string;
}

export default function EtsyMockupDialog({
  open, onOpenChange, masterUrl, sourceLabel,
}: EtsyMockupDialogProps) {
  const [bundle, setBundle] = useState<MockupBundle | null>(null);
  const [generating, setGenerating] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, label: "" });
  const [selectedIds, setSelectedIds] = useState<string[]>(DEFAULT_MOCKUP_PACK_IDS);
  const bundleRef = useRef<MockupBundle | null>(null);

  const allTemplates = useMemo(() => getMockupTemplates(), []);

  // Discard previous bundle when the dialog closes or master changes
  useEffect(() => {
    if (!open) {
      revokeMockupBundle(bundleRef.current);
      bundleRef.current = null;
      setBundle(null);
      setProgress({ done: 0, total: 0, label: "" });
    }
  }, [open]);

  useEffect(() => () => revokeMockupBundle(bundleRef.current), []);

  const toggleTemplate = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleGenerate = async () => {
    if (!masterUrl) {
      toast.error("No source image available");
      return;
    }
    if (!selectedIds.length) {
      toast.error("Select at least one mockup template");
      return;
    }
    setGenerating(true);
    setProgress({ done: 0, total: selectedIds.length, label: "" });
    try {
      const next = await generateMockupsForImage(masterUrl, {
        templateIds: selectedIds,
        onProgress: (p) =>
          setProgress({ done: p.done, total: p.total, label: p.currentLabel ?? "" }),
      });
      revokeMockupBundle(bundleRef.current);
      bundleRef.current = next;
      setBundle(next);
      if (next.results.length === 0) {
        toast.error("No mockups could be rendered");
      } else {
        toast.success(`Generated ${next.results.length} mockup${next.results.length === 1 ? "" : "s"}`);
      }
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to generate mockups");
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadZip = async () => {
    if (!bundle?.results.length) return;
    setZipping(true);
    try {
      const zip = await buildMockupZip(bundle);
      const safeLabel = (sourceLabel || "artwork").replace(/[^a-z0-9]+/gi, "-").slice(0, 40);
      downloadMockupZip(zip, `etsy-mockups-${safeLabel || "artwork"}.zip`);
      toast.success("Mockup ZIP ready");
    } catch (err) {
      console.error(err);
      toast.error("Failed to package mockups");
    } finally {
      setZipping(false);
    }
  };

  const progressPct = progress.total
    ? Math.round((progress.done / progress.total) * 100)
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Etsy listing mockups
          </DialogTitle>
          <DialogDescription>
            Generate ready-to-use listing images from your master artwork — frames,
            interiors, close-ups and clean backgrounds. Always sourced from the
            highest-quality version of your image.
          </DialogDescription>
        </DialogHeader>

        {!masterUrl && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <ImageOff className="h-4 w-4" /> No source image available.
          </div>
        )}

        {/* Template chooser */}
        <div className="space-y-2">
          <div className="text-xs font-display uppercase tracking-wide text-muted-foreground">
            Included mockups
          </div>
          <div className="flex flex-wrap gap-2">
            {allTemplates.map((t) => {
              const active = selectedIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleTemplate(t.id)}
                  disabled={generating}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-display transition-colors",
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:bg-accent",
                  )}
                  title={t.description}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {selectedIds.length} selected · default pack contains {DEFAULT_MOCKUP_PACK_IDS.length} mockups
          </p>
        </div>

        {/* Generate / progress */}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={handleGenerate}
            disabled={!masterUrl || generating || !selectedIds.length}
            className="font-display"
          >
            {generating
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <Layers className="mr-2 h-4 w-4" />}
            {bundle ? "Re-generate mockups" : "Generate mockups"}
          </Button>
          {bundle && bundle.results.length > 0 && (
            <Button
              variant="outline"
              onClick={handleDownloadZip}
              disabled={zipping}
              className="font-display border-primary/30 text-primary hover:bg-primary/10"
            >
              {zipping
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <Package className="mr-2 h-4 w-4" />}
              Download all (ZIP)
            </Button>
          )}
        </div>

        {generating && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{progress.label || "Rendering..."}</span>
              <span>{progress.done}/{progress.total}</span>
            </div>
            <Progress value={progressPct} className="h-1.5" />
          </div>
        )}

        {/* Results grid */}
        {bundle && bundle.results.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            {bundle.results.map((r) => (
              <div
                key={r.templateId}
                className="rounded-md border border-border bg-card overflow-hidden"
              >
                <div className="aspect-[4/3] bg-muted/30 flex items-center justify-center overflow-hidden">
                  <img
                    src={r.url}
                    alt={r.label}
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
                <div className="flex items-center justify-between gap-2 p-2.5">
                  <div className="min-w-0">
                    <div className="text-xs font-display truncate">{r.label}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {r.width}×{r.height}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge variant="outline" className="font-display text-[10px]">
                      {r.layout}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => downloadMockupResult(r)}
                      className="h-7 px-2"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
