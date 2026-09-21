alter table public.plan_interest_leads add column viewed boolean not null default false;

create policy "Site admins update leads"
  on public.plan_interest_leads for update to authenticated
  using (has_role(auth.uid(), 'admin'))
  with check (has_role(auth.uid(), 'admin'));
