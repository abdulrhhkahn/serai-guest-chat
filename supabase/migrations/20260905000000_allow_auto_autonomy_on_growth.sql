create or replace function public.autonomy_level_allowed(_property_id uuid, _level text)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select case _level
    when 'suggest' then true
    when 'approve' then public.property_has_plan_at_least(_property_id, 'growth')
    when 'auto' then public.property_has_plan_at_least(_property_id, 'growth')
    else false
  end
$function$;
