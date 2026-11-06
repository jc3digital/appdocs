-- Ejecutar UNA vez si ya habías pegado 01_schema.sql: los duplicados también nacen privados.
create or replace function duplicate_document(src uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare s documents; new_id uuid;
begin
 if not can_view_doc(src) then raise exception 'Sin acceso al documento'; end if;
 select * into s from documents where id=src;
 new_id:=create_document(s.document_type_id, case when is_admin() or type_perm(s.document_type_id,'private') then 'private' else 'shared' end);
 update documents set content=s.content, fields=s.fields, title='Copia de '||s.title, duplicated_from=src where id=new_id;
 return new_id; end $$;
