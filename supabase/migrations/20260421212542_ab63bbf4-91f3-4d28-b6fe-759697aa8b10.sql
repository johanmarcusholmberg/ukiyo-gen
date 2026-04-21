ALTER TABLE public.upscale_jobs
  ADD COLUMN IF NOT EXISTS recipe_id text,
  ADD COLUMN IF NOT EXISTS recipe_label text,
  ADD COLUMN IF NOT EXISTS recipe_reason text;

CREATE INDEX IF NOT EXISTS idx_upscale_jobs_recipe_id ON public.upscale_jobs(recipe_id);