-- Track which upscale mode produced the enhanced asset, when it ran,
-- and preserve the original/base storage path so re-upscaling always
-- works from the original instead of an already-upscaled derivative.
ALTER TABLE public.generated_images
  ADD COLUMN IF NOT EXISTS upscale_mode text,
  ADD COLUMN IF NOT EXISTS original_storage_path text,
  ADD COLUMN IF NOT EXISTS upscaled_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS export_preferred_asset text;

-- Backfill: existing rows treat the current storage_path as the original/base.
UPDATE public.generated_images
SET original_storage_path = storage_path
WHERE original_storage_path IS NULL;