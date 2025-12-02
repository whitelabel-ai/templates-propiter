;(function(){
  const cfg = window.CONFIG || {}
  const BACKEND = String(cfg.BACKEND_URL || '').replace(/\/$/, '') || (location.origin)
  const pathname = location.pathname.replace(/^\/+|\/+$/g,'')
  const isPrint = pathname.startsWith('print/')
  const slug = isPrint ? pathname.slice('print/'.length) : pathname
  const q = new URLSearchParams(location.search)
  const allowedRole = (q.get('role') || '').trim().toLowerCase()

  const sel = s => document.querySelector(s)
  const all = s => Array.from(document.querySelectorAll(s))

  function roleSlug(s){ return String(s || '').trim().toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9\-]/g,'') }
  function nameSlug(s){ return String(s || '').trim().toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9\-]/g,'') }

  function setReadOnly(meta){
    all('.signature-controls').forEach(x=>x.remove())
    const link = document.createElement('a')
    link.textContent = 'Descargar PDF'
    link.className = 'download-pdf'
    const origin = location.origin
    link.href = BACKEND + '/api/pdf/' + (meta.slug || slug) + '?origin=' + encodeURIComponent(origin)
    link.setAttribute('download', (meta.baseName || 'documento') + '.pdf')
    const bar = document.createElement('div')
    bar.className = 'top-bar'
    bar.appendChild(link)
    document.body.insertBefore(bar, document.body.firstChild)
  }

  function enableSignature(box, meta){
    if (isPrint) return
    const nameEl = box.querySelector('.signature-name')
    const roleEl = box.querySelector('.signature-role')
    const currentRole = roleEl ? roleEl.textContent : ''
    const currentName = nameEl ? nameEl.textContent : ''
    if (allowedRole && roleSlug(currentRole) !== roleSlug(allowedRole)) return
    const area = box.querySelector('.signature-area') || box
    const placeholder = document.createElement('div')
    placeholder.className = 'signature-placeholder'
    const who = [currentName, currentRole].filter(Boolean).join(' · ')
    placeholder.textContent = who ? ('Toca para firmar: ' + who) : 'Toca aquí para firmar'
    area.innerHTML = ''
    area.appendChild(placeholder)

    function openModal(){
      const overlay = document.createElement('div')
      overlay.className = 'signature-overlay signature-controls'
      const modal = document.createElement('div')
      modal.className = 'signature-modal'
      const signer = document.createElement('div')
      signer.className = 'signature-signer'
      signer.textContent = who || 'Firma'
      const canvas = document.createElement('canvas')
      canvas.className = 'signature-canvas'
      const vw = Math.min(window.innerWidth - 48, 680)
      const vh = Math.max(180, Math.min(320, Math.floor(window.innerHeight * 0.35)))
      canvas.width = Math.floor(vw)
      canvas.height = Math.floor(vh)
      const ctx = canvas.getContext('2d')
      let drawing = false
      let prev = null
      function pos(e){ const r = canvas.getBoundingClientRect(); const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left; const y = (e.touches ? e.touches[0].clientY : e.clientY) - r.top; return { x, y } }
      function start(e){ drawing = true; prev = pos(e) }
      function move(e){ if(!drawing) return; const p = pos(e); ctx.lineWidth=2; ctx.lineJoin='round'; ctx.lineCap='round'; ctx.strokeStyle='#111'; ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(p.x, p.y); ctx.stroke(); prev = p }
      function end(){ drawing = false }
      canvas.addEventListener('mousedown', start)
      canvas.addEventListener('mousemove', move)
      canvas.addEventListener('mouseup', end)
      canvas.addEventListener('mouseleave', end)
      canvas.addEventListener('touchstart', start, { passive: true })
      canvas.addEventListener('touchmove', move, { passive: true })
      canvas.addEventListener('touchend', end)
      const actions = document.createElement('div')
      actions.className = 'signature-actions'
      const btnSave = document.createElement('button')
      btnSave.textContent = 'Guardar'
      const btnClear = document.createElement('button')
      btnClear.textContent = 'Limpiar'
      btnClear.addEventListener('click', ()=>{ ctx.clearRect(0,0,canvas.width,canvas.height) })
      btnSave.addEventListener('click', async ()=>{
        const data = canvas.toDataURL('image/png')
        const role = currentRole
        const name = currentName
        const r = await fetch(BACKEND + '/api/signature/' + (meta.slug || slug), { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ role, name, imageData: data }) })
        const j = await r.json()
        if (j && (j.fileUrl || j.path)){
          const img = new Image()
          img.className = 'signature-image'
          img.src = j.fileUrl ? (BACKEND + j.fileUrl) : (BACKEND + j.path + '?t=' + Date.now())
          img.onload = ()=>{ area.innerHTML = ''; area.appendChild(img); overlay.remove(); checkAllSigned(meta) }
        }
      })
      actions.appendChild(btnSave)
      actions.appendChild(btnClear)
      modal.appendChild(signer)
      modal.appendChild(canvas)
      modal.appendChild(actions)
      overlay.appendChild(modal)
      overlay.addEventListener('click', (e)=>{ if (e.target === overlay) overlay.remove() })
      document.body.appendChild(overlay)
    }
    placeholder.addEventListener('click', openModal)
  }

  async function hydrateTemplate(meta){
    const boxes = all('.signature-box')
    for (const box of boxes){
      const area = box.querySelector('.signature-area') || box
      const existing = area.querySelector('img.signature-image') || box.querySelector('img.signature-image')
      if (existing) { area.innerHTML = ''; area.appendChild(existing) }
    }
    for (const box of boxes){
      const roleEl = box.querySelector('.signature-role')
      const nameEl = box.querySelector('.signature-name')
      const currentRole = roleEl ? roleEl.textContent : ''
      const currentName = nameEl ? nameEl.textContent : ''
      const area = box.querySelector('.signature-area') || box
      const already = area.querySelector('img.signature-image')
      if (!already){
        try {
          const params = new URLSearchParams({ name: currentName, role: currentRole })
          const r = await fetch(BACKEND + '/api/signature/exists/' + (meta.slug || slug) + '?' + params.toString())
          const j = await r.json()
          if (j && j.exists && j.fileUrl){
            const img = new Image()
            img.className = 'signature-image'
            img.src = BACKEND + j.fileUrl
            area.innerHTML = ''
            area.appendChild(img)
          }
        } catch(e) {}
      }
    }
    for (const box of boxes){
      const area = box.querySelector('.signature-area') || box
      const hasImg = !!area.querySelector('img.signature-image')
      if (!hasImg) enableSignature(box, meta)
    }
    checkAllSigned(meta)
  }

  function checkAllSigned(meta){
    const boxes = all('.signature-box')
    const signed = boxes.every(b => b.querySelector('img.signature-image'))
    if (signed && !isPrint) setReadOnly(meta)
  }

  function computeMeta(sl){
    const s = String(sl||'').replace(/^\/+|\/+$/g,'')
    const dir = s.includes('/') ? s.split('/').slice(0,-1).join('/') : ''
    const base = s.split('/').pop()
    return { slug: s, slugDir: dir, baseName: base }
  }

  async function fetchTemplateHtml(sl){
    const s = String(sl||'').replace(/^\/+|\/+$/g,'')
    const try1 = '/templates/' + s + '.html'
    const try2 = '/templates/' + s + '/index.html'
    let r = await fetch(try1)
    if (!r.ok) r = await fetch(try2)
    if (!r.ok) return null
    return await r.text()
  }

  function injectHeadFromDoc(doc, meta){
    const head = doc && doc.head ? doc.head : null
    if (!head) return
    all('head [data-template-style="1"]').forEach(n=>n.remove())
    const basePath = '/templates/' + (meta.slugDir ? (meta.slugDir + '/') : '')
    head.querySelectorAll('style, link[rel="stylesheet"]').forEach(el=>{
      const clone = el.cloneNode(true)
      clone.setAttribute('data-template-style','1')
      const tag = (clone.tagName || '').toLowerCase()
      if (tag === 'link'){
        const href = clone.getAttribute('href') || ''
        const isAbs = /^(https?:)?\/\//i.test(href) || href.startsWith('/')
        if (!isAbs){
          clone.setAttribute('href', basePath + href.replace(/^\.?\/+/, ''))
        }
      }
      document.head.appendChild(clone)
    })
    const titleEl = head.querySelector('title')
    if (titleEl) document.title = titleEl.textContent || document.title
  }

  async function loadList(){
    const el = sel('#list')
    try {
      const r = await fetch('/templates/manifest.json')
      if (r.ok){
        const items = await r.json()
        if (Array.isArray(items) && items.length){
          items.forEach(s=>{ const a=document.createElement('a'); a.href='/' + s; a.textContent=s; const div=document.createElement('div'); div.appendChild(a); el.appendChild(div) })
          return
        }
      }
    } catch(e) {}
    el.textContent = 'Proporcione la URL de la plantilla en la barra de direcciones.'
  }

  async function loadTemplate(){
    if (!slug){
      await loadList()
      return
    }
    const html = await fetchTemplateHtml(slug)
    if (!html){ sel('#template-content').textContent = 'No encontrado'; return }
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const meta = computeMeta(slug)
    injectHeadFromDoc(doc, meta)
    const bodyHtml = (doc.body && doc.body.innerHTML) ? doc.body.innerHTML : html
    sel('#template-content').innerHTML = bodyHtml
    await hydrateTemplate(meta)
  }

  document.addEventListener('DOMContentLoaded', loadTemplate)
})()
