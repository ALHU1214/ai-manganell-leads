-- Diagnóstico: qué políticas tiene realmente la tabla leads ahora mismo.
-- Ejecuta esto en Supabase → SQL Editor y pásame el resultado.
select
  policyname                  as politica,
  cmd                         as operacion,   -- INSERT / SELECT / UPDATE / DELETE / ALL
  permissive                  as tipo,        -- PERMISSIVE o RESTRICTIVE
  roles                       as roles,
  qual                        as using_expr,
  with_check                  as with_check_expr
from pg_policies
where schemaname = 'public' and tablename = 'leads'
order by cmd, policyname;
