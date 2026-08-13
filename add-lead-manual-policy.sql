-- Permite insertar leads también desde el panel (usuario logueado),
-- no solo desde el formulario público de la web.
create policy "Tú puedes crear leads a mano desde el panel"
  on leads for insert
  to authenticated
  with check (true);
