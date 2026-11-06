import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate, useParams, Outlet } from 'react-router-dom'
import { createClient } from '@supabase/supabase-js'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import Image from '@tiptap/extension-image'
import { Roles, Types, Identity } from './Admin'
import { geom, hdrHtml, ftrHtml, paginate, PageBreaks, pgKey } from './pagination'
import { sb, URL_, KEY_ } from './lib/supabase'

const EXT = [StarterKit, Underline, TextAlign.configure({ types: ['heading', 'paragraph'] }), Table.configure({ resizable: true }), TableRow, TableHeader, TableCell, Image]
const Ctx = createContext<any>(null)
const useAuth = () => useContext(Ctx)
const fdate = (s: string) => s ? new Date(s).toLocaleString('es') : ''

function Auth({ children }: any) {
  const [session, setSession] = useState<any>(undefined); const [profile, setProfile] = useState<any>(null)
  const loadP = async (s: any) => { if (!s) return setProfile(null); const r = await sb.from('profiles').select('*, roles(*)').eq('id', s.user.id).maybeSingle(); setProfile(r.data) }
  useEffect(() => { sb.auth.getSession().then(({ data }) => { setSession(data.session); loadP(data.session) })
    const { data } = sb.auth.onAuthStateChange((_e, s) => { setSession(s); loadP(s) }); return () => data.subscription.unsubscribe() }, [])
  if (session === undefined) return <p>Cargando…</p>
  return <Ctx.Provider value={{ session, profile, isAdmin: !!profile?.roles?.is_admin, reload: () => loadP(session) }}>{children}</Ctx.Provider>
}

function Login() {
  const { session } = useAuth(); const [e, setE] = useState(''); const [p, setP] = useState(''); const [err, setErr] = useState('')
  if (session) return <Navigate to="/" replace />
  const go = async (ev: any) => { ev.preventDefault(); const r = await sb.auth.signInWithPassword({ email: e, password: p }); if (r.error) setErr(r.error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos' : 'Error: ' + r.error.message) }
  return <form className="login" onSubmit={go}><h1>DISORTHMED</h1><input placeholder="Correo" type="email" value={e} onChange={x => setE(x.target.value)} required />
    <input placeholder="Contraseña" type="password" value={p} onChange={x => setP(x.target.value)} required /><button className="p">Ingresar</button><span className="err">{err}</span></form>
}

function ChangePass() {
  const { profile, reload } = useAuth(); const [p, setP] = useState(''); const [err, setErr] = useState('')
  const go = async (ev: any) => { ev.preventDefault(); if (p.length < 8) return setErr('Mínimo 8 caracteres')
    const r = await sb.auth.updateUser({ password: p }); if (r.error) return setErr(r.error.message)
    await sb.from('profiles').update({ must_change_password: false }).eq('id', profile.id); reload() }
  return <form className="login" onSubmit={go}><h1>Crea tu contraseña</h1><p>Es tu primer ingreso. Elige una contraseña nueva.</p>
    <input type="password" placeholder="Nueva contraseña" value={p} onChange={x => setP(x.target.value)} /><button className="p">Guardar contraseña</button><span className="err">{err}</span></form>
}

function Layout() {
  const { session, profile, isAdmin } = useAuth()
  if (!session) return <Navigate to="/login" />
  if (!profile || !profile.is_active) return <div className="login"><h1>Sin acceso</h1><p>Tu cuenta no tiene permisos. Pide al administrador que la active.</p><button onClick={() => sb.auth.signOut()}>Salir</button></div>
  if (profile.must_change_password) return <ChangePass />
  return <div className="shell"><nav><b style={{ color: '#fff', padding: '.5rem' }}>DISORTHMED</b><Link to="/">Inicio</Link><Link to="/documentos/nuevo">Crear documento</Link><Link to="/documentos">Todos los documentos</Link>
    {isAdmin && <><Link to="/admin/usuarios">Usuarios</Link><Link to="/admin/roles">Roles y permisos</Link><Link to="/admin/tipos">Tipos de documento</Link><Link to="/admin/identidad">Identidad</Link></>}<button onClick={() => sb.auth.signOut()}>Salir ({profile.full_name || profile.email})</button></nav><main><Outlet /></main></div>
}

function Dashboard() {
  const [docs, setDocs] = useState<any[]>([]); const [types, setTypes] = useState<any[]>([])
  useEffect(() => { sb.from('documents').select('id,status,document_type_id').then(r => setDocs(r.data || [])); sb.from('document_types').select('*').eq('is_active', true).order('sort').then(r => setTypes(r.data || [])) }, [])
  return <><h1>Inicio</h1><Link className="btn p" to="/documentos/nuevo">Crear documento</Link>
    <div className="grid row"><div className="box"><h2>{docs.filter(d => d.status === 'draft').length}</h2>Borradores</div><div className="box"><h2>{docs.filter(d => d.status === 'ready').length}</h2>Listos</div></div>
    <h2>Categorías</h2><div className="grid">{types.map(t => <Link key={t.id} className="box" to={`/documentos/tipo/${t.slug}`}>{t.name}<br />{docs.filter(d => d.document_type_id === t.id).length} documentos</Link>)}</div></>
}

function NewDoc() {
  const { isAdmin, profile } = useAuth(); const nav = useNavigate(); const [types, setTypes] = useState<any[]>([]); const [shared, setShared] = useState(false); const [err, setErr] = useState('')
  useEffect(() => { (async () => { const t = await sb.from('document_types').select('*').eq('is_active', true).order('sort'); const p = await sb.from('role_document_permissions').select('*').eq('role_id', profile.role_id)
    setTypes((t.data || []).filter((x: any) => isAdmin || p.data?.find((q: any) => q.document_type_id === x.id && q.can_create))) })() }, [])
  const make = async (id: string) => { const r = await sb.rpc('create_document', { t: id, mode: shared ? 'shared' : 'private' }); if (r.error) return setErr(r.error.message); nav(`/documentos/${r.data}/editar`) }
  return <><h1>¿Qué documento quieres crear?</h1><label className="row"><input type="checkbox" checked={shared} onChange={e => setShared(e.target.checked)} /> Compartido (visible para quienes tengan acceso a este tipo). Si no lo marcas, el documento será privado.</label>
    <div className="grid">{types.map(t => <button key={t.id} className="box" onClick={() => make(t.id)}>{t.name}</button>)}</div>{!types.length && <p>No tienes tipos de documento autorizados.</p>}<p className="err">{err}</p></>
}

function List() {
  const { slug } = useParams(); const [rows, setRows] = useState<any[]>([]); const [people, setPeople] = useState<any[]>([]); const [f, setF] = useState({ status: '', num: '', from: '', by: '' })
  useEffect(() => { let q: any = sb.from('documents').select('id,number,title,status,access_mode,created_at,updated_at,document_types!inner(name,slug),profiles!documents_created_by_fkey(full_name,email)').order('updated_at', { ascending: false })
    if (slug) q = q.eq('document_types.slug', slug); if (f.status) q = q.eq('status', f.status); if (f.num) q = q.ilike('number', `%${f.num}%`); if (f.from) q = q.gte('created_at', f.from); if (f.by) q = q.eq('created_by', f.by)
    q.then((r: any) => setRows(r.data || [])) }, [slug, f])
  useEffect(() => { sb.from('profiles').select('id,full_name,email').then(r => setPeople(r.data || [])) }, [])
  return <><h1>{slug ? 'Documentos' : 'Todos los documentos'}</h1><div className="row"><select value={f.status} onChange={e => setF({ ...f, status: e.target.value })}><option value="">Todos los estados</option><option value="draft">Borrador</option><option value="ready">Listo</option></select>
    <input placeholder="Número" value={f.num} onChange={e => setF({ ...f, num: e.target.value })} /><select value={f.by} onChange={e => setF({ ...f, by: e.target.value })}><option value="">Todos los creadores</option>{people.map(u => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}</select><input type="date" value={f.from} onChange={e => setF({ ...f, from: e.target.value })} /></div>
    <div className="tw"><table className="l"><thead><tr><th>Número</th><th>Título</th><th>Creado</th><th>Modificado</th><th>Creador</th><th>Estado</th><th>Acceso</th></tr></thead><tbody>
      {rows.map(d => <tr key={d.id}><td><Link to={`/documentos/${d.id}`}>{d.number}</Link></td><td>{d.title}</td><td>{fdate(d.created_at)}</td><td>{fdate(d.updated_at)}</td><td>{d.profiles?.full_name || d.profiles?.email}</td>
        <td><span className={`tag ${d.status}`}>{d.status === 'draft' ? 'Borrador' : 'Listo'}</span></td><td>{d.access_mode === 'private' ? 'Privado' : 'Compartido'}</td></tr>)}</tbody></table></div>
    {!rows.length && <p>No hay documentos con estos filtros.</p>}</>
}

function Sheet({ d, editor }: any) {
  const s = d.design_snapshot, c = s.company || {}, t = s.type || {}; const land = t.orientation === 'landscape'
  const dims = t.page_size === 'Letter' ? [216, 279] : [210, 297]; const w = land ? dims[1] : dims[0]
  return <><style>{`@page{size:${t.page_size === 'Letter' ? 'letter' : 'A4'} ${land ? 'landscape' : 'portrait'};margin:${t.margin_mm || 20}mm 0}`}</style>
    <table className="sheet" style={{ width: `${w}mm`, maxWidth: '100%', fontFamily: c.font_family, ['--m' as any]: `${t.margin_mm || 20}mm` }}>
      <thead><tr><td><div className="pad" style={{ borderBottom: `3px solid ${c.primary_color}`, padding: '8mm var(--m) 3mm' }}>{c.extra?.logo_url && <img src={c.extra.logo_url} alt="" style={{ maxHeight: '16mm', display: 'block', marginBottom: 4 }} />}<b style={{ color: c.primary_color, fontSize: '1.4rem' }}>{c.company_name}</b><div style={{ fontSize: '.8rem' }}>{c.contact}</div></div></td></tr></thead>
      <tbody><tr><td><div className="pad" style={{ minHeight: '150mm' }}><EditorContent editor={editor} /></div></td></tr></tbody>
      <tfoot><tr><td><div className="pad" style={{ fontSize: '.75rem', borderTop: `1px solid ${c.primary_color}`, padding: '3mm var(--m)' }}>{c.footer_text} · {d.number}</div></td></tr></tfoot></table></>
}

function Pages({ d, json }: any) {
  const { g, pages } = useMemo(() => { const g = geom(d.design_snapshot); return { g, ...paginate(json, g, EXT) } }, [d.design_snapshot, json])
  return <><style>{`@page{size:${g.W}mm ${g.H}mm;margin:0}`}</style>{pages.map((p: string[], i: number) =>
    <div className="page" key={i} style={{ width: g.W + 'mm', height: g.H + 'mm', fontFamily: g.c.font_family, paddingTop: g.vp + 'mm' }}>
      <div dangerouslySetInnerHTML={{ __html: hdrHtml(g.c, g) }} />
      <div className="ProseMirror" style={{ height: g.contentH + 'mm', padding: `0 ${g.m}mm`, overflow: 'hidden' }} dangerouslySetInnerHTML={{ __html: p.join('') }} />
      <div dangerouslySetInnerHTML={{ __html: ftrHtml(g.c, g, d.number, i + 1, pages.length) }} /></div>)}</>
}

function Doc({ edit }: { edit?: boolean }) {
  const { id } = useParams(); const nav = useNavigate(); const { session } = useAuth(); const [d, setD] = useState<any>(null); const [title, setTitle] = useState(''); const [st, setSt] = useState('Guardado'); const [msg, setMsg] = useState(''); const [mail, setMail] = useState('')
  const [live, setLive] = useState<any>(null); const [pg, setPg] = useState({ n: 1, fill: 0 }); const [showPrev, setShowPrev] = useState(window.innerWidth > 1300)
  const tm = useRef<any>(); const pt = useRef<any>(); const ctx = useRef<any>({})
  useEffect(() => { sb.from('documents').select('*').eq('id', id).single().then(r => { setD(r.data); setTitle(r.data?.title || '') }) }, [id])
  const g = useMemo(() => d ? geom(d.design_snapshot) : null, [d?.design_snapshot])
  ctx.current = { g, c: g?.c, number: d?.number }
  const save = async (patch: any) => { setSt('Guardando…'); const r = await sb.from('documents').update(patch).eq('id', id); setSt(r.error ? 'Error al guardar: ' + r.error.message : 'Guardado'); return r }
  const repag = (e: any) => { if (!edit || !ctx.current.g || !e?.view || e.isDestroyed) return; const r = paginate(e.getJSON(), ctx.current.g, EXT)
    e.view.dispatch(e.state.tr.setMeta(pgKey, { breaks: r.breaks, n: r.pages.length }).setMeta('addToHistory', false)); setPg({ n: r.pages.length, fill: r.lastFill }) }
  const ed = useEditor({ extensions: edit ? [...EXT, PageBreaks(ctx)] : EXT, content: d?.content, editable: !!edit && d?.status === 'draft',
    onCreate: ({ editor }) => { setTimeout(() => repag(editor), 60) },
    onUpdate: ({ editor }) => { setSt('Guardando…'); clearTimeout(tm.current); tm.current = setTimeout(() => save({ content: editor.getJSON() }), 2000)
      clearTimeout(pt.current); pt.current = setTimeout(() => { repag(editor); setLive(editor.getJSON()) }, 250) } }, [d?.id, edit, d?.status])
  useEffect(() => { if (!ed || ed.isDestroyed || !edit) return; const dom = ed.view.dom; const h = () => repag(ed); dom.addEventListener('load', h, true); return () => dom.removeEventListener('load', h, true) }, [ed])
  if (!d || !g) return <p>Cargando…</p>
  const img = async (e: any) => { const file = e.target.files[0]; if (!file) return; const path = `documents/${id}/${crypto.randomUUID()}.${file.name.split('.').pop()}`; const u = await sb.storage.from('document-assets').upload(path, file); if (u.error) return setMsg(u.error.message)
    const s = await sb.storage.from('document-assets').createSignedUrl(path, 315360000); ed!.chain().focus().setImage({ src: s.data!.signedUrl }).run(); e.target.value = '' }
  const act = async (fn: () => Promise<any>) => { const r = await fn(); if (r?.error) setMsg(r.error.message) }
  const B = (l: string, fn: string, cmd: string) => <button className={ed?.isActive(cmd) ? 'on' : ''} onClick={() => (ed!.chain().focus() as any)[fn]().run()}>{l}</button>
  return <><div className="row noprint"><h1 style={{ margin: 0 }}>{d.number}</h1><span className={`tag ${d.status}`}>{d.status === 'draft' ? 'Borrador' : 'Listo'}</span>
    {edit ? <><input value={title} onChange={e => setTitle(e.target.value)} onBlur={() => save({ title })} placeholder="Título del documento" /><span>{st} · {pg.n} pág.</span><button onClick={() => { setShowPrev(!showPrev); setLive(ed!.getJSON()) }}>{showPrev ? 'Ocultar vista previa' : 'Ver vista previa'}</button>
      <button className="p" onClick={async () => { clearTimeout(tm.current); const r = await save({ content: ed!.getJSON(), title, status: 'ready' }); if (!r.error) nav(`/documentos/${id}`) }}>Listo</button></>
      : <><button onClick={() => act(async () => { if (d.status === 'ready') { const r = await sb.from('documents').update({ status: 'draft' }).eq('id', id); if (r.error) return r }; nav(`/documentos/${id}/editar`) })}>Editar</button>
        <button onClick={() => act(async () => { const r = await sb.rpc('duplicate_document', { src: id }); if (!r.error) nav(`/documentos/${r.data}/editar`); return r })}>Duplicar</button>
        {d.status === 'ready' ? <button className="p" onClick={() => window.print()}>Imprimir / PDF</button> : <span>Marca «Listo» para exportar.</span>}
        <select value={d.access_mode} onChange={e => act(async () => { const r = await save({ access_mode: e.target.value }); if (!r.error) setD({ ...d, access_mode: e.target.value }); return r })}><option value="private">Privado</option><option value="shared">Compartido</option></select></>}</div>
    {msg && <p className="err">{msg}</p>}
    {edit && d.status === 'draft' && <div className="tb noprint">{B('N', 'toggleBold', 'bold')}{B('K', 'toggleItalic', 'italic')}{B('S', 'toggleUnderline', 'underline')}{B('• Lista', 'toggleBulletList', 'bulletList')}{B('1. Lista', 'toggleOrderedList', 'orderedList')}
      <button onClick={() => ed!.chain().focus().toggleHeading({ level: 1 }).run()}>Título</button><button onClick={() => ed!.chain().focus().toggleHeading({ level: 2 }).run()}>Subtítulo</button>
      {['left', 'center', 'right', 'justify'].map(a => <button key={a} onClick={() => ed!.chain().focus().setTextAlign(a).run()}>{({ left: 'Izq', center: 'Centro', right: 'Der', justify: 'Justif' } as any)[a]}</button>)}
      <button onClick={() => ed!.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>Tabla</button><button onClick={() => ed!.chain().focus().addRowAfter().run()}>+ Fila</button><button onClick={() => ed!.chain().focus().addColumnAfter().run()}>+ Columna</button><button onClick={() => ed!.chain().focus().deleteTable().run()}>Quitar tabla</button>
      <button onClick={() => ed!.chain().focus().setHorizontalRule().run()}>Salto de página</button><button onClick={() => ed!.chain().focus().insertContent('<p></p><p>______________________________</p><p>Nombre</p><p>Cargo</p><p>Sello</p>').run()}>Firma</button>
      <label className="btn" style={{ padding: '.3rem .6rem' }}>Imagen<input type="file" accept="image/*" hidden onChange={img} /></label></div>}
    {edit ? <div className="split"><div className="scroll"><div className="esheet" style={{ width: g.W + 'mm', fontFamily: g.c.font_family, ['--m' as any]: g.m + 'mm' }}>
        <div style={{ paddingTop: g.vp + 'mm' }} dangerouslySetInnerHTML={{ __html: hdrHtml(g.c, g) }} /><EditorContent editor={ed} /><div style={{ height: pg.fill }} />
        <div style={{ height: (g.ftr + g.vp) + 'mm' }} dangerouslySetInnerHTML={{ __html: ftrHtml(g.c, g, d.number, pg.n, pg.n) }} /></div></div>
      {showPrev && <div className="prevw noprint"><b>Vista previa</b><div style={{ zoom: 0.55 }}><Pages d={d} json={live || d.content} /></div></div>}</div>
      : <div className="scroll"><Pages d={d} json={d.content} /></div>}
    {!edit && <div className="row noprint"><input placeholder="Correo de la persona a autorizar" value={mail} onChange={e => setMail(e.target.value)} /><button onClick={() => act(async () => { const u = await sb.from('profiles').select('id').ilike('email', mail).maybeSingle(); if (!u.data) return { error: { message: 'No existe ese usuario' } }
      const r = await sb.from('document_permissions').insert({ document_id: id, user_id: u.data.id, granted_by: session.user.id }); setMsg(r.error ? 'No tienes permiso para compartir con esa persona' : 'Autorizado'); return null })}>Compartir</button></div>}</>
}

function Users() {
  const { isAdmin, profile } = useAuth(); const [us, setUs] = useState<any[]>([]); const [roles, setRoles] = useState<any[]>([]); const [f, setF] = useState({ name: '', email: '', role: '', pass: '' }); const [msg, setMsg] = useState('')
  const load = () => { sb.from('profiles').select('*').order('created_at').then(r => setUs(r.data || [])); sb.from('roles').select('*').then(r => { setRoles(r.data || []); setF(x => ({ ...x, role: x.role || r.data?.find((q: any) => !q.is_admin)?.id || '' })) }) }
  useEffect(load, [])
  if (!isAdmin) return <Navigate to="/" />
  const create = async (ev: any) => { ev.preventDefault(); setMsg(''); if (f.pass.length < 8) return setMsg('La contraseña inicial necesita 8 caracteres o más')
    const inv = await sb.from('user_invitations').insert({ email: f.email, full_name: f.name, role_id: f.role, created_by: profile.id }).select('token').single(); if (inv.error) return setMsg(inv.error.message)
    const other = createClient(URL_, KEY_, { auth: { persistSession: false, autoRefreshToken: false } })
    const r = await other.auth.signUp({ email: f.email, password: f.pass, options: { data: { invite_token: inv.data.token } } })
    if (r.error) return setMsg(r.error.message); setMsg('Usuario creado. Entrégale la contraseña inicial; deberá cambiarla al ingresar.'); setF({ ...f, name: '', email: '', pass: '' }); setTimeout(load, 800) }
  const upd = async (id: string, p: any) => { const r = await sb.from('profiles').update(p).eq('id', id); if (r.error) setMsg(r.error.message); load() }
  return <><h1>Usuarios</h1><form className="box row" onSubmit={create}><input placeholder="Nombre" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required /><input type="email" placeholder="Correo" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} required />
    <select value={f.role} onChange={e => setF({ ...f, role: e.target.value })}>{roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select><input placeholder="Contraseña inicial" value={f.pass} onChange={e => setF({ ...f, pass: e.target.value })} required /><button className="p">Crear usuario</button></form><p>{msg}</p>
    <div className="tw"><table className="l"><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Activo</th></tr></thead><tbody>{us.map(u => <tr key={u.id}><td>{u.full_name}</td><td>{u.email}</td>
      <td><select value={u.role_id || ''} disabled={u.id === profile.id} onChange={e => upd(u.id, { role_id: e.target.value })}>{roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></td>
      <td><input type="checkbox" checked={u.is_active} disabled={u.id === profile.id} onChange={e => upd(u.id, { is_active: e.target.checked })} /></td></tr>)}</tbody></table></div></>
}

export default function App() {
  return <Auth><BrowserRouter><Routes><Route path="/login" element={<Login />} /><Route element={<Layout />}><Route path="/" element={<Dashboard />} /><Route path="/documentos" element={<List />} /><Route path="/documentos/nuevo" element={<NewDoc />} />
    <Route path="/documentos/tipo/:slug" element={<List />} /><Route path="/documentos/:id" element={<Doc />} /><Route path="/documentos/:id/editar" element={<Doc edit />} /><Route path="/admin/usuarios" element={<Users />} /><Route path="/admin/roles" element={<Roles />} /><Route path="/admin/tipos" element={<Types />} /><Route path="/admin/identidad" element={<Identity />} /></Route></Routes></BrowserRouter></Auth>
}
