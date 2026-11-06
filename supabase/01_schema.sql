-- DISORTHMED · Pegar completo en Supabase > SQL Editor > Run (una sola vez)
create extension if not exists pgcrypto;
create table roles(id uuid primary key default gen_random_uuid(), name text unique not null, description text, is_admin bool not null default false, is_system bool not null default false);
create table profiles(id uuid primary key references auth.users on delete cascade, email text, full_name text, role_id uuid references roles, is_active bool not null default true, must_change_password bool not null default true, created_at timestamptz default now());
create table company_settings(id uuid primary key default gen_random_uuid(), company_name text not null, logo_path text, primary_color text default '#16283c', font_family text default 'Georgia, serif', contact text, footer_text text, extra jsonb default '{}', is_current bool default true, created_at timestamptz default now());
create table document_types(id uuid primary key default gen_random_uuid(), name text not null, slug text unique not null, prefix text not null, page_size text default 'A4', orientation text default 'portrait', margin_mm int default 20, is_active bool default true, sort int default 0);
create table document_templates(id uuid primary key default gen_random_uuid(), document_type_id uuid not null references document_types, layout jsonb default '{}', initial_content jsonb, field_definitions jsonb default '[]', is_current bool default true, created_at timestamptz default now());
create table documents(id uuid primary key default gen_random_uuid(), document_type_id uuid not null references document_types, number text not null unique, title text not null default 'Sin título', status text not null default 'draft' check (status in ('draft','ready')), access_mode text not null default 'shared' check (access_mode in ('shared','private')), content jsonb not null default '{"type":"doc","content":[{"type":"paragraph"}]}', fields jsonb default '{}', design_snapshot jsonb not null, created_by uuid not null references profiles, created_at timestamptz default now(), updated_at timestamptz default now(), finalized_at timestamptz, duplicated_from uuid references documents on delete set null);
create table document_counters(document_type_id uuid references document_types, year int, last_value int not null default 0, primary key(document_type_id,year));
create table role_document_permissions(role_id uuid references roles on delete cascade, document_type_id uuid references document_types on delete cascade, can_create bool default false, can_view bool default false, can_edit bool default false, can_finalize bool default false, can_delete bool default false, can_create_private bool default false, can_share bool default false, primary key(role_id,document_type_id));
create table document_permissions(document_id uuid references documents on delete cascade, user_id uuid references profiles on delete cascade, can_edit bool default false, can_share bool default false, granted_by uuid references profiles, created_at timestamptz default now(), primary key(document_id,user_id));
create table user_invitations(token uuid primary key default gen_random_uuid(), email text not null, full_name text, role_id uuid not null references roles, created_by uuid references profiles, expires_at timestamptz default now()+interval '1 hour', used bool default false);
create index on documents(document_type_id); create index on documents(created_by); create index on document_permissions(user_id);

create function is_active_user() returns bool language sql stable security definer set search_path=public as $$ select exists(select 1 from profiles where id=auth.uid() and is_active) $$;
create function is_admin() returns bool language sql stable security definer set search_path=public as $$ select exists(select 1 from profiles p join roles r on r.id=p.role_id where p.id=auth.uid() and p.is_active and r.is_admin) $$;
create function type_perm(t uuid, a text) returns bool language sql stable security definer set search_path=public as $$
 select exists(select 1 from profiles p join role_document_permissions r on r.role_id=p.role_id where p.id=auth.uid() and p.is_active and r.document_type_id=t and
 case a when 'create' then r.can_create when 'view' then r.can_view when 'edit' then r.can_edit when 'finalize' then r.can_finalize when 'delete' then r.can_delete when 'private' then r.can_create_private when 'share' then r.can_share else false end) $$;
create function can_view_doc(d uuid) returns bool language sql stable security definer set search_path=public as $$
 select is_active_user() and exists(select 1 from documents x where x.id=d and (is_admin() or x.created_by=auth.uid()
 or exists(select 1 from document_permissions dp where dp.document_id=x.id and dp.user_id=auth.uid())
 or (x.access_mode='shared' and type_perm(x.document_type_id,'view')))) $$;
create function can_edit_doc(d uuid) returns bool language sql stable security definer set search_path=public as $$
 select can_view_doc(d) and exists(select 1 from documents x where x.id=d and (is_admin() or type_perm(x.document_type_id,'edit')
 or exists(select 1 from document_permissions dp where dp.document_id=x.id and dp.user_id=auth.uid() and dp.can_edit))) $$;
create function can_share_doc(d uuid) returns bool language sql stable security definer set search_path=public as $$
 select can_view_doc(d) and exists(select 1 from documents x where x.id=d and (is_admin() or (type_perm(x.document_type_id,'share')
 and (x.created_by=auth.uid() or exists(select 1 from document_permissions dp where dp.document_id=x.id and dp.user_id=auth.uid() and dp.can_share))))) $$;

create function create_document(t uuid, mode text default 'shared') returns uuid language plpgsql security definer set search_path=public as $$
declare y int:=extract(year from now()); n int; dt document_types; cs company_settings; tp document_templates; new_id uuid;
begin
 if not is_active_user() or not (is_admin() or type_perm(t,'create')) then raise exception 'Sin permiso para crear este documento'; end if;
 if mode='private' and not (is_admin() or type_perm(t,'private')) then raise exception 'Sin permiso para documentos privados'; end if;
 select * into dt from document_types where id=t and is_active; if not found then raise exception 'Tipo no disponible'; end if;
 select * into cs from company_settings where is_current order by created_at desc limit 1;
 select * into tp from document_templates where document_type_id=t and is_current order by created_at desc limit 1;
 insert into document_counters(document_type_id,year,last_value) values(t,y,1) on conflict (document_type_id,year) do update set last_value=document_counters.last_value+1 returning last_value into n;
 insert into documents(document_type_id,number,access_mode,content,design_snapshot,created_by)
 values(t, dt.prefix||'-'||y||'-'||lpad(n::text,3,'0'), mode, coalesce(tp.initial_content,'{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb),
 jsonb_build_object('company',to_jsonb(cs),'type',to_jsonb(dt),'layout',coalesce(tp.layout,'{}'::jsonb)), auth.uid()) returning id into new_id;
 return new_id; end $$;

create function duplicate_document(src uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare s documents; new_id uuid;
begin
 if not can_view_doc(src) then raise exception 'Sin acceso al documento'; end if;
 select * into s from documents where id=src;
 new_id:=create_document(s.document_type_id, case when is_admin() or type_perm(s.document_type_id,'private') then 'private' else 'shared' end);
 update documents set content=s.content, fields=s.fields, title='Copia de '||s.title, duplicated_from=src where id=new_id;
 return new_id; end $$;

create function guard_documents() returns trigger language plpgsql as $$
begin
 if new.number<>old.number or new.created_by<>old.created_by or new.document_type_id<>old.document_type_id or new.design_snapshot<>old.design_snapshot then raise exception 'Campo protegido'; end if;
 if new.access_mode<>old.access_mode and not (is_admin() or old.created_by=auth.uid()) then raise exception 'Solo el creador cambia el acceso'; end if;
 if new.access_mode='private' and old.access_mode='shared' and not (is_admin() or type_perm(old.document_type_id,'private')) then raise exception 'Sin permiso para documentos privados'; end if;
 if old.status='ready' and new.status='ready' and (new.content<>old.content or new.title<>old.title) then new.status:='draft'; end if;
 if new.status='ready' and old.status='draft' then
  if not (is_admin() or type_perm(old.document_type_id,'finalize')) then raise exception 'Sin permiso para finalizar'; end if;
  new.finalized_at:=now(); end if;
 new.updated_at:=now(); return new; end $$;
create trigger t_guard_documents before update on documents for each row execute function guard_documents();

create function guard_profiles() returns trigger language plpgsql as $$
begin
 if (new.role_id is distinct from old.role_id or new.is_active<>old.is_active or new.email is distinct from old.email) and not is_admin() then raise exception 'Solo el administrador cambia rol o estado'; end if;
 return new; end $$;
create trigger t_guard_profiles before update on profiles for each row execute function guard_profiles();

create function handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
declare inv user_invitations;
begin
 begin
  select * into inv from user_invitations where token=(new.raw_user_meta_data->>'invite_token')::uuid and not used and expires_at>now() and lower(email)=lower(new.email);
  if found then
   insert into profiles(id,email,full_name,role_id,must_change_password) values(new.id,new.email,inv.full_name,inv.role_id,true);
   update user_invitations set used=true where token=inv.token;
  end if;
 exception when others then null; end;
 return new; end $$;
create trigger t_new_user after insert on auth.users for each row execute function handle_new_user();

alter table roles enable row level security; alter table profiles enable row level security; alter table company_settings enable row level security;
alter table document_types enable row level security; alter table document_templates enable row level security; alter table documents enable row level security;
alter table document_counters enable row level security; alter table role_document_permissions enable row level security; alter table document_permissions enable row level security; alter table user_invitations enable row level security;
create policy r_sel on roles for select using (is_active_user()); create policy r_adm on roles for all using (is_admin()) with check (is_admin());
create policy p_sel on profiles for select using (is_active_user() or id=auth.uid());
create policy p_upd on profiles for update using (is_admin() or id=auth.uid()) with check (is_admin() or id=auth.uid());
create policy c_sel on company_settings for select using (is_active_user()); create policy c_adm on company_settings for all using (is_admin()) with check (is_admin());
create policy t_sel on document_types for select using (is_active_user()); create policy t_adm on document_types for all using (is_admin()) with check (is_admin());
create policy tp_sel on document_templates for select using (is_active_user()); create policy tp_adm on document_templates for all using (is_admin()) with check (is_admin());
create policy rp_sel on role_document_permissions for select using (is_active_user()); create policy rp_adm on role_document_permissions for all using (is_admin()) with check (is_admin());
create policy cnt_adm on document_counters for all using (is_admin()) with check (is_admin());
create policy inv_adm on user_invitations for all using (is_admin()) with check (is_admin());
create policy d_sel on documents for select using (can_view_doc(id));
create policy d_upd on documents for update using (can_edit_doc(id)) with check (can_view_doc(id));
create policy d_del on documents for delete using (is_admin() or (can_view_doc(id) and type_perm(document_type_id,'delete')));
create policy dp_sel on document_permissions for select using (is_admin() or user_id=auth.uid() or can_share_doc(document_id));
create policy dp_ins on document_permissions for insert with check (user_id<>auth.uid() and can_share_doc(document_id) and granted_by=auth.uid());
create policy dp_del on document_permissions for delete using (is_admin() or can_share_doc(document_id));
grant execute on function create_document(uuid,text), duplicate_document(uuid) to authenticated;

insert into storage.buckets(id,name,public) values('document-assets','document-assets',false) on conflict do nothing;
create policy a_sel on storage.objects for select using (bucket_id='document-assets' and is_active_user());
create policy a_ins on storage.objects for insert with check (bucket_id='document-assets' and ((name like 'brand/%' and is_admin()) or (name like 'documents/%' and can_edit_doc(split_part(name,'/',2)::uuid))));
create policy a_del on storage.objects for delete using (bucket_id='document-assets' and ((name like 'brand/%' and is_admin()) or (name like 'documents/%' and can_edit_doc(split_part(name,'/',2)::uuid))));

-- Datos iniciales
insert into roles(name,description,is_admin,is_system) values('Administrador','Acceso completo',true,true),('Redactor','Redacta según permisos',false,true);
insert into company_settings(company_name,contact,footer_text) values('DISORTHMED','Dirección · Teléfono · correo@disorthmed.com','DISORTHMED');
insert into document_types(name,slug,prefix,sort) values('Cartas comerciales','cartas','DIS-CAR',1),('Cotizaciones','cotizaciones','DIS-COT',2),('Preventas','preventas','DIS-PRE',3),('Rotulación de envíos','rotulacion','DIS-ROT',4);
insert into document_templates(document_type_id) select id from document_types;
insert into role_document_permissions select r.id,t.id,true,true,true,true,false,true,true from roles r cross join document_types t where not r.is_admin;
