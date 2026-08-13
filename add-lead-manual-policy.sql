-- Permite insertar leads también desde el panel (usuario logueado),
-- no solo desde el formulario público de la web.
--
-- Es idempotente: se puede ejecutar las veces que haga falta sin romper nada.
-- Primero borra la política si ya existía (por si quedó a medias o mal), y
-- luego la vuelve a crear.

drop policy if exists "Tú puedes crear leads a mano desde el panel" on public.leads;
drop policy if exists "Tu puedes crear leads a mano desde el panel" on public.leads;

create policy "Tu puedes crear leads a mano desde el panel"
  on public.leads for insert
  to authenticated
  with check (true);

-- Comprobación: debe aparecer la política de INSERT para el rol authenticated.
select policyname, cmd, permissive, roles
from pg_policies
where schemaname = 'public' and tablename = 'leads'
order by cmd, policyname;
