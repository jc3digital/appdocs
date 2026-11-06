import { Extension } from '@tiptap/core'
import { generateHTML } from '@tiptap/html'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
export const K = 96 / 25.4
export const pgKey = new PluginKey('pg')
const esc = (s: any) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[m])

export function geom(s: any) {
  const c = s.company || {}, t = s.type || {}, ex = c.extra?.show || {}
  const show = { name: ex.name !== false, logo: ex.logo !== false, contact: ex.contact !== false, footer: ex.footer !== false }
  const dims = t.page_size === 'Letter' ? [216, 279] : [210, 297]; const land = t.orientation === 'landscape'
  const W = land ? dims[1] : dims[0], H = land ? dims[0] : dims[1]
  const hdr = show.logo && c.extra?.logo_url ? 30 : (show.name || show.contact ? 18 : 0)
  const vp = 10, ftr = 12, m = t.margin_mm || 20
  return { c, show, W, H, m, vp, hdr, ftr, contentH: H - 2 * vp - hdr - ftr }
}
export const hdrHtml = (c: any, g: any) => !g.hdr ? '' :
  `<div style="height:${g.hdr}mm;padding:0 ${g.m}mm;border-bottom:3px solid ${esc(c.primary_color)};overflow:hidden;box-sizing:border-box">${g.show.logo && c.extra?.logo_url ? `<img src="${esc(c.extra.logo_url)}" style="max-height:16mm;display:block;margin-bottom:2px">` : ''}${g.show.name ? `<b style="color:${esc(c.primary_color)};font-size:1.3rem">${esc(c.company_name)}</b>` : ''}${g.show.contact ? `<div style="font-size:.8rem">${esc(c.contact)}</div>` : ''}</div>`
export const ftrHtml = (c: any, g: any, number: string, i: number, n: number) =>
  `<div style="height:${g.ftr}mm;padding:3mm ${g.m}mm 0;border-top:1px solid ${esc(c.primary_color)};font-size:.75rem;display:flex;justify-content:space-between;box-sizing:border-box"><span>${g.show.footer ? esc(c.footer_text) : ''}</span><span>${esc(number)} · Pág. ${i} de ${n}</span></div>`

// Mide cada bloque y reparte en páginas. Un bloque no se parte entre páginas.
export function paginate(json: any, g: any, ext: any[]) {
  const nodes: any[] = json?.content || []
  const htmls = nodes.map(n => n.type === 'horizontalRule' ? '<hr>' : generateHTML({ type: 'doc', content: [n] }, ext))
  const box = document.createElement('div')
  box.style.cssText = `position:absolute;left:-99999px;top:0;visibility:hidden;width:${g.W}mm;font-family:${g.c.font_family}`
  box.innerHTML = `<div class="ProseMirror" style="padding:0 ${g.m}mm">${htmls.map(h => `<div>${h}</div>`).join('')}</div>`
  document.body.appendChild(box)
  const root = box.firstElementChild as HTMLElement, kids = Array.from(root.children)
  const tops = kids.map(k => k.getBoundingClientRect().top), end = root.getBoundingClientRect().bottom
  document.body.removeChild(box)
  const hs = tops.map((t, i) => (i + 1 < tops.length ? tops[i + 1] : end) - t)
  const limit = g.contentH * K; const pages: string[][] = [[]]; const breaks: any[] = []; let used = 0, pending = false
  nodes.forEach((n, i) => {
    if (n.type === 'horizontalRule') { used += hs[i]; if (i + 1 < nodes.length) pending = true; return }
    if (pending || (used + hs[i] > limit && used > 0)) { breaks.push({ index: i, fill: Math.max(0, limit - used), page: pages.length }); pages.push([]); used = 0; pending = false }
    pages[pages.length - 1].push(htmls[i]); used += hs[i]
  })
  return { pages, breaks, lastFill: Math.max(0, limit - used) }
}

function makeWidget(ctx: any, b: any, n: number) {
  const { g, c, number } = ctx; const el = document.createElement('div')
  el.contentEditable = 'false'; el.style.cssText = `margin:0 -${g.m}mm;user-select:none`
  el.innerHTML = `<div style="height:${b.fill}px"></div><div style="height:${g.ftr + g.vp}mm;background:#fff;box-sizing:border-box">${ftrHtml(c, g, number, b.page, n)}</div><div style="height:14px;background:#e3e7eb"></div><div style="height:${g.vp + g.hdr}mm;padding-top:${g.vp}mm;background:#fff;box-sizing:border-box">${hdrHtml(c, g)}</div>`
  return el
}
export const PageBreaks = (ctx: { current: any }) => Extension.create({
  name: 'pageBreaks',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: pgKey,
      state: {
        init: () => DecorationSet.empty,
        apply(tr, old) {
          const m = tr.getMeta(pgKey)
          if (m) { const decos = m.breaks.map((b: any) => { let pos = 0; tr.doc.forEach((_n, off, idx) => { if (idx === b.index) pos = off })
            return Decoration.widget(pos, () => makeWidget(ctx.current, b, m.n), { side: -1, key: `pb${b.index}-${Math.round(b.fill)}-${m.n}` }) }); return DecorationSet.create(tr.doc, decos) }
          return old.map(tr.mapping, tr.doc)
        }
      },
      props: { decorations(s) { return pgKey.getState(s) } }
    })]
  }
})
