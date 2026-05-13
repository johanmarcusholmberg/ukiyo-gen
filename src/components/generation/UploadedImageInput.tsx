/**
 * UploadedImageInput — lets the user upload a reference / source image
 * that the generator will treat as `sourceImageUrl` (edit-style flow).
 *
 * Uploads land in the existing public `generated-images` bucket under an
 * `uploads/` prefix to avoid a new bucket migration. The generated result
 * is NOT auto-saved — only the source upload is uploaded here.
 */
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, X, ImagePlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const ALLOWED = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const BUCKET = "generated-images";

export interface UploadedSource {
  url: string;
  storagePath: string;
  fileName: string;
}

interface Props {
  value: UploadedSource | null;
  onChange: (next: UploadedSource | null) => void;
  disabled?: boolean;
}

export default function UploadedImageInput({ value, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const pick = () => inputRef.current?.click();

  const handleFile = async (file: File) => {
    if (!ALLOWED.includes(file.type)) {
      toast({
        title: "Unsupported file type",
        description: "Please upload a PNG, JPG, or WebP image.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({
        title: "File too large",
        description: "Maximum size is 10 MB.",
        variant: "destructive",
      });
      return;
    }
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
      const path = `uploads/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      onChange({ url: pub.publicUrl, storagePath: path, fileName: file.name });
      toast({ title: "Image uploaded", description: "Source image ready for generation." });
    } catch (err: any) {
      console.error("[UploadedImageInput] upload failed:", err);
      toast({
        title: "Upload failed",
        description: err?.message || "Could not upload image.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void handleFile(f);
  };

  if (value) {
    return (
      <div className="flex items-start gap-3 p-3 rounded-sm border border-border bg-card/60">
        <img
          src={value.url}
          alt={value.fileName}
          className="h-20 w-20 rounded-sm border border-border object-cover flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="font-display text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
            Source image
          </p>
          <p className="font-display text-xs text-foreground truncate">{value.fileName}</p>
          <p className="font-display text-[11px] text-muted-foreground mt-1">
            Your prompt will be applied to this image.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange(null)}
          disabled={disabled}
          className="font-display text-xs h-7"
        >
          <X className="h-3 w-3 mr-1" />
          Remove
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={onInputChange}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={pick}
        disabled={disabled || uploading}
        className="font-display text-xs h-8"
      >
        {uploading ? (
          <>
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            Uploading…
          </>
        ) : (
          <>
            <ImagePlus className="h-3.5 w-3.5 mr-1.5" />
            Upload source image
          </>
        )}
      </Button>
      <span className="font-display text-[11px] text-muted-foreground">
        Optional · PNG / JPG / WebP · up to 10 MB
      </span>
    </div>
  );
}
