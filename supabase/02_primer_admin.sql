-- Antes de ejecutar: cambia el correo por el del usuario que creaste en Authentication > Users
insert into profiles(id,email,full_name,role_id,must_change_password)
select u.id,u.email,'Administrador',(select id from roles where is_admin limit 1),false
from auth.users u where lower(u.email)=lower('TU_CORREO@EJEMPLO.COM')
on conflict (id) do update set role_id=excluded.role_id,is_active=true,must_change_password=false;
