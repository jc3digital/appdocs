import { useEffect, useState } from 'react'
import { sb } from './lib/supabase'
const PERMS: [string, string][] = [['can_create', 'Crear'], ['can_view', 'Consultar'], ['can_edit', 'Editar'], ['can_finalize', 'Finalizar'], ['can_delete', 'Eliminar'], ['can_create_private', 'Privados'], ['can_share', 'Compartir']]
const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export function Roles() {
  const [roles, setRoles] = useState<any[]>([]); const [types, setTypes] = useState<any[]>([]); const [perms, setPerms] = useState<any[]>([]); const [sel, setSel] = useState(''); const [name, setName] = useState(''); const [msg, setMsg] = useState('')
  const load = async () => { const r = await sb.from('roles').select('*').order('name'); setRoles(r.data || []); setSel(s => s || r.data?.find((x: any) => !x.is_admin)?.id || '')
    setTypes((await sb.from('document_types').select('*').order('sort')).data || []); setPerms((await sb.from('role_document_permissions').select('*')).data || []) }
  useEffect(() => { load() }, [])
  const role = roles.find(r => r.id === sel)
  const toggle = async (t: string, k: string, v: boolean) => { const cur = perms.find(p => p.role_id === sel && p.document_type_id === t) || {}
    const r = await sb.from('role_document_permissions').upsert({ ...cur, role_id: sel, document_type_id: t, [k]: v }, { onConflict: 'role_id,document_type_id' }); setMsg(r.error ? r.error.message : ''); load() }
  const add = async (e: any) => { e.preventDefault(); const r = await sb.from('roles').insert({ name }).select().single(); if (r.error) return setMsg(r.error.message); setName(''); setSel(r.data.id); load() }
  const del = async () => { if (!confirm('¿Eliminar este rol?')) return; const r = await sb.from('roles').delete().eq('id', sel); if (r.error) setMsg('No se puede eliminar: hay usuarios con este rol'); else { setSel(''); load() } }
  return <><h1>Roles y permisos</h1><form className="row" onSubmit={add}><input placeholder="Nuevo rol (ej. Gerencia)" value={name} onChange={e => setName(e.target.value)} required /><button className="p">Crear rol</button></form>
    <div className="row"><select value={sel} onChange={e => setSel(e.target.value)}>{roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>{role && !role.is_system && <button onClick={del}>Eliminar rol</button>}</div><p className="err">{msg}</p>
    {role?.is_admin ? <p>El administrador tiene acceso total. No se configura.</p> : <div className="tw"><table className="l"><thead><tr><th>Tipo de documento</th>{PERMS.map(p => <th key={p[0]}>{p[1]}</th>)}</tr></thead><tbody>
      {types.map(t => { const cur = perms.find(p => p.role_id === sel && p.document_type_id === t.id) || {}; return <tr key={t.id}><td>{t.name}</td>{PERMS.map(p => <td key={p[0]}><input type="checkbox" checked={!!cur[p[0]]} onChange={e => toggle(t.id, p[0], e.target.checked)} /></td>)}</tr> })}</tbody></table></div>}</>
}

export function Types() {
  const [ts, setTs] = useState<any[]>([]); const [f, setF] = useState({ name: '', prefix: 'DIS-' }); const [msg, setMsg] = useState('')
  const load = () => sb.from('document_types').select('*').order('sort').then(r => setTs(r.data || []))
  useEffect(() => { load() }, [])
  const set = async (id: string, patch: any) => { setTs(ts.map(t => t.id === id ? { ...t, ...patch } : t)); const r = await sb.from('document_types').update(patch).eq('id', id); setMsg(r.error ? r.error.message : 'Cambios guardados. Aplican a documentos nuevos.') }
  const add = async (e: any) => { e.preventDefault(); const r = await sb.from('document_types').insert({ name: f.name, prefix: f.prefix.toUpperCase(), slug: slugify(f.name), sort: ts.length + 1 }).select().single()
    if (r.error) return setMsg(r.error.message); await sb.from('document_templates').insert({ document_type_id: r.data.id }); setF({ name: '', prefix: 'DIS-' }); setMsg('Tipo creado. Autoriza roles en «Roles y permisos».'); load() }
  return <><h1>Tipos de documento</h1><form className="box row" onSubmit={add}><input placeholder="Nombre (ej. Informes gerenciales)" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required /><input placeholder="Prefijo (DIS-INF)" value={f.prefix} onChange={e => setF({ ...f, prefix: e.target.value })} required /><button className="p">Crear tipo</button></form><p>{msg}</p>
    <div className="tw"><table className="l"><thead><tr><th>Nombre</th><th>Prefijo</th><th>Página</th><th>Orientación</th><th>Margen (mm)</th><th>Activo</th></tr></thead><tbody>{ts.map(t => <tr key={t.id}>
      <td><input value={t.name} onChange={e => setTs(ts.map(x => x.id === t.id ? { ...x, name: e.target.value } : x))} onBlur={e => set(t.id, { name: e.target.value })} /></td>
      <td><input value={t.prefix} size={9} onChange={e => setTs(ts.map(x => x.id === t.id ? { ...x, prefix: e.target.value } : x))} onBlur={e => set(t.id, { prefix: e.target.value.toUpperCase() })} /></td>
      <td><select value={t.page_size} onChange={e => set(t.id, { page_size: e.target.value })}><option>A4</option><option>Letter</option></select></td>
      <td><select value={t.orientation} onChange={e => set(t.id, { orientation: e.target.value })}><option value="portrait">Vertical</option><option value="landscape">Horizontal</option></select></td>
      <td><input type="number" min={5} max={50} style={{ width: 70 }} value={t.margin_mm} onChange={e => set(t.id, { margin_mm: +e.target.value })} /></td>
      <td><input type="checkbox" checked={t.is_active} onChange={e => set(t.id, { is_active: e.target.checked })} /></td></tr>)}</tbody></table></div></>
}

export function Identity() {
  const [c, setC] = useState<any>(null); const [msg, setMsg] = useState('')
  useEffect(() => { sb.from('company_settings').select('*').eq('is_current', true).order('created_at', { ascending: false }).limit(1).maybeSingle().then(r => setC(r.data)) }, [])
  if (!c) return <p>Cargando…</p>
  const up = async (e: any) => { const file = e.target.files[0]; if (!file) return; const path = `brand/${crypto.randomUUID()}.${file.name.split('.').pop()}`
    const u = await sb.storage.from('document-assets').upload(path, file); if (u.error) return setMsg(u.error.message)
    const s = await sb.storage.from('document-assets').createSignedUrl(path, 315360000); setC({ ...c, logo_path: path, extra: { ...c.extra, logo_url: s.data?.signedUrl } }) }
  const save = async (e: any) => { e.preventDefault(); const { id, created_at, ...rest } = c
    await sb.from('company_settings').update({ is_current: false }).eq('is_current', true)
    const r = await sb.from('company_settings').insert({ ...rest, is_current: true }).select().single(); if (r.error) return setMsg(r.error.message)
    setC(r.data); setMsg('Identidad guardada. Aplica solo a documentos nuevos; los anteriores conservan su diseño.') }
  const s = (k: string) => (e: any) => setC({ ...c, [k]: e.target.value })
  return <><h1>Identidad corporativa</h1><form className="box" style={{ display: 'grid', gap: '.7rem', maxWidth: 520 }} onSubmit={save}>
    <label>Nombre de la empresa<input style={{ width: '100%' }} value={c.company_name} onChange={s('company_name')} required /></label>
    <label>Color corporativo <input type="color" value={c.primary_color} onChange={s('primary_color')} /></label>
    <label>Tipografía<select style={{ width: '100%' }} value={c.font_family} onChange={s('font_family')}><option value="Georgia, serif">Georgia (serif)</option><option value="Arial, sans-serif">Arial (sans)</option><option value="'Times New Roman', serif">Times New Roman</option><option value="Verdana, sans-serif">Verdana</option><option value="'Trebuchet MS', sans-serif">Trebuchet</option></select></label>
    <label>Información de contacto<input style={{ width: '100%' }} value={c.contact || ''} onChange={s('contact')} /></label>
    <label>Texto del pie de página<input style={{ width: '100%' }} value={c.footer_text || ''} onChange={s('footer_text')} /></label>
    <label>Logotipo<input type="file" accept="image/*" onChange={up} /></label>{c.extra?.logo_url && <img src={c.extra.logo_url} alt="Logotipo" style={{ maxHeight: 70 }} />}
    <button className="p">Guardar identidad</button><span>{msg}</span></form></>
}
