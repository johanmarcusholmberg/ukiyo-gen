-- Normalize legacy generated_images.mode values to canonical style keys.
-- Safe/idempotent: only updates rows that still hold known legacy values.
UPDATE public.generated_images SET mode = 'whimsical_japanese'     WHERE mode = 'whimsicaljapanese';
UPDATE public.generated_images SET mode = 'modernist_cocktail'     WHERE mode = 'modernistcocktail';
UPDATE public.generated_images SET mode = 'mediterranean_heritage' WHERE mode = 'mediterraneanheritage';
UPDATE public.generated_images SET mode = 'scandinavian_poster'    WHERE mode = 'scandinavianposter';
UPDATE public.generated_images SET mode = 'ukiyoe'                 WHERE mode = 'japanese';