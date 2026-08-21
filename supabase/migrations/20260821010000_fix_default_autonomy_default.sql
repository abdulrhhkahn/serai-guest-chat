-- The original column default was 'auto', predating plan gating — every
-- new property (and any existing one never explicitly changed) starts on
-- the most-restricted, always-allowed level, matching Starter's actual
-- feature set instead of an already-restricted one.
alter table public.properties alter column default_autonomy set default 'suggest';

-- Backfill: any existing property currently sitting on a level its plan no
-- longer allows (i.e. was set before plan gating existed) drops to
-- 'suggest' instead of showing as a broken/disabled selection.
update public.properties
set default_autonomy = 'suggest'
where not public.autonomy_level_allowed(id, default_autonomy);
