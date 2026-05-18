ALTER TABLE public.generated_images
  ADD COLUMN IF NOT EXISTS requested_model_id text,
  ADD COLUMN IF NOT EXISTS resolved_model_id text,
  ADD COLUMN IF NOT EXISTS selected_adapter_id text,
  ADD COLUMN IF NOT EXISTS quality_profile text,
  ADD COLUMN IF NOT EXISTS generation_strategy text,
  ADD COLUMN IF NOT EXISTS model_fallback_reason text;