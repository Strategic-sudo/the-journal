import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono()


app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Accept', 'Authorization'],
  exposeHeaders: ['Authorization'],
}))



const JWT_ALG   = { name: 'HMAC', hash: 'SHA-256' }
const JWT_EXP   = 8 * 60 * 60  

function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/')
  while (str.length % 4) str += '='
  const bin = atob(str)
  return Uint8Array.from(bin, c => c.charCodeAt(0))
}

async function jwtSign(payload, secret) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), JWT_ALG, false, ['sign']
  )
  const header  = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const body    = b64url(new TextEncoder().encode(JSON.stringify({ ...payload, iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000) + JWT_EXP })))
  const sig     = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${body}`))
  return `${header}.${body}.${b64url(sig)}`
}

async function jwtVerify(token, secret) {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret), JWT_ALG, false, ['verify']
    )
    const valid = await crypto.subtle.verify(
      'HMAC', key,
      b64urlDecode(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    )
    if (!valid) return null
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])))
    if (payload.exp < Math.floor(Date.now()/1000)) return null  // expired
    return payload
  } catch { return null }
}



async function hashPassword(password) {
  const salt   = crypto.getRandomValues(new Uint8Array(16))
  const keyMat = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits   = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600_000 }, keyMat, 256
  )
  
  const toHex  = (buf) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('')
  return `pbkdf2$${toHex(salt)}$${toHex(bits)}`
}

async function verifyPassword(password, stored) {
  try {
    const [, saltHex, hashHex] = stored.split('$')
    const salt   = new Uint8Array(saltHex.match(/.{2}/g).map(h => parseInt(h, 16)))
    const keyMat = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
    const bits   = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600_000 }, keyMat, 256
    )
    const toHex  = (buf) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('')
    
    const a = await crypto.subtle.importKey('raw', new Uint8Array(bits), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const b = await crypto.subtle.importKey('raw', new TextEncoder().encode(hashHex), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const sigA = await crypto.subtle.sign('HMAC', a, new TextEncoder().encode('cmp'))
    const sigB = await crypto.subtle.sign('HMAC', b, new TextEncoder().encode('cmp'))
    
    return toHex(new Uint8Array(sigA)) === toHex(new Uint8Array(sigB)) && toHex(new Uint8Array(bits)) === hashHex
  } catch { return false }
}



async function requireAuth(c, next) {
  const authHeader = c.req.header('Authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return c.json({ error: 'Unauthorized — no token' }, 401)

  const secret  = c.env.JWT_SECRET
  if (!secret)  return c.json({ error: 'Server misconfiguration' }, 500)

  const payload = await jwtVerify(token, secret)
  if (!payload) return c.json({ error: 'Unauthorized — invalid or expired token' }, 401)

  c.set('user', payload)
  await next()
}



const loginAttempts = new Map()  

function checkRateLimit(ip) {
  const now    = Date.now()
  const window = 15 * 60 * 1000  
  const max    = 10               

  const rec = loginAttempts.get(ip) || { count: 0, firstAt: now }
  if (now - rec.firstAt > window) {
    loginAttempts.set(ip, { count: 1, firstAt: now })
    return false  
  }
  rec.count++
  loginAttempts.set(ip, rec)
  return rec.count > max
}


app.get('/', (c) => c.text('JOURNAL API — online'))


app.post('/api/auth/login', async (c) => {
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown'

  if (checkRateLimit(ip)) {
    return c.json({ error: 'Too many attempts — try again in 15 minutes' }, 429)
  }

  let body
  try { body = await c.req.json() }
  catch { return c.json({ error: 'Invalid JSON' }, 400) }

  const username = String(body.username || '').trim().slice(0, 64)
  const password = String(body.password || '').slice(0, 128)

  if (!username || !password) return c.json({ error: 'username and password required' }, 400)

  const secret = c.env.JWT_SECRET
  if (!secret) return c.json({ error: 'Server misconfiguration' }, 500)

  try {
    const row = await c.env.DB
      .prepare('SELECT id, username, hash, password FROM auth WHERE username = ?')
      .bind(username)
      .first()

    
    const storedHash = row ? (row.hash || row.password || '') : ''
    const dummyHash = 'pbkdf2$0000000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000'
    const valid = row && storedHash ? await verifyPassword(password, storedHash) : (await verifyPassword(password, dummyHash), false)

    if (!valid) {
     
      await new Promise(r => setTimeout(r, 500 + Math.random() * 300))
      return c.json({ error: 'Invalid credentials' }, 401)
    }

    const token = await jwtSign({ sub: row.id, username: row.username, role: 'admin' }, secret)
    return c.json({ token, username: row.username })

  } catch (err) {
    console.error('Login error:', err)
    return c.json({ error: 'Authentication error' }, 500)
  }
})


app.get('/api/auth/verify', requireAuth, (c) => {
  const user = c.get('user')
  return c.json({ ok: true, username: user.username })
})


app.post('/api/auth/setup', async (c) => {
  let body
  try { body = await c.req.json() }
  catch { return c.json({ error: 'Invalid JSON' }, 400) }

  const secret = c.env.JWT_SECRET
  
  if (!secret || body.setupKey !== secret) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  
  const existing = await c.env.DB.prepare('SELECT COUNT(*) as n FROM auth').first()
  if (existing && existing.n > 0) {
    return c.json({ error: 'Setup already completed — use login endpoint' }, 409)
  }

  const username = String(body.username || '').trim().slice(0, 64)
  const password = String(body.password || '').slice(0, 128)
  if (!username || password.length < 8) return c.json({ error: 'username required and password must be ≥8 chars' }, 400)

  try {
    const hash = await hashPassword(password)
    
    await c.env.DB.prepare('INSERT INTO auth (username, password, hash) VALUES (?, ?, ?)').bind(username, 'managed_by_hash', hash).run()
    return c.json({ ok: true, message: 'Admin account created. Remove or protect this endpoint.' }, 201)
  } catch (err) {
    console.error('Setup error:', err)
    return c.json({ error: 'Failed to create account' }, 500)
  }
})



app.get('/api/posts', async (c) => {
  try {
    const { results } = await c.env.DB
      .prepare('SELECT * FROM posts ORDER BY id DESC')
      .all()
    return c.json(results)
  } catch (err) {
    console.error('GET /api/posts error:', err)
    return c.json({ error: 'Failed to fetch posts' }, 500)
  }
})

app.get('/api/posts/:id', async (c) => {
  const { id } = c.req.param()
  try {
    const { results } = await c.env.DB
      .prepare('SELECT * FROM posts WHERE id = ?')
      .bind(id).all()
    if (!results?.length) return c.json({ error: 'Post not found' }, 404)
    return c.json(results[0])
  } catch (err) {
    console.error('GET /api/posts/:id error:', err)
    return c.json({ error: 'Failed to fetch post' }, 500)
  }
})



app.post('/api/posts', requireAuth, async (c) => {
  let body
  try { body = await c.req.json() }
  catch { return c.json({ error: 'Invalid JSON body' }, 400) }

  const { author, title, content, category, excerpt } = body
  if (!title?.trim() || !content?.trim()) return c.json({ error: 'title and content are required' }, 400)

  try {
    const { success, meta } = await c.env.DB
      .prepare('INSERT INTO posts (author, title, content, category, excerpt) VALUES (?, ?, ?, ?, ?)')
      .bind(author ?? 'Staff', title.trim(), content.trim(), category ?? 'GEOPOLITICS', excerpt ?? '')
      .run()
    if (!success) return c.json({ error: 'Failed to create post' }, 500)
    return c.json({ message: 'Post created', id: meta?.last_row_id ?? null }, 201)
  } catch (err) {
    
    try {
      const { success, meta } = await c.env.DB
        .prepare('INSERT INTO posts (author, title, content) VALUES (?, ?, ?)')
        .bind(author ?? 'Staff', title.trim(), content.trim())
        .run()
      if (!success) return c.json({ error: 'Failed to create post' }, 500)
      return c.json({ message: 'Post created', id: meta?.last_row_id ?? null }, 201)
    } catch (err2) {
      console.error('POST /api/posts error:', err2)
      return c.json({ error: 'Failed to create post' }, 500)
    }
  }
})

app.delete('/api/posts/:id', requireAuth, async (c) => {
  const { id } = c.req.param()
  try {
    await c.env.DB.prepare('DELETE FROM comments WHERE post_id = ?').bind(id).run()
    const { success } = await c.env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(id).run()
    if (!success) return c.json({ error: 'Failed to delete post' }, 500)
    return c.json({ message: 'Post deleted' })
  } catch (err) {
    console.error('DELETE /api/posts/:id error:', err)
    return c.json({ error: 'Failed to delete post' }, 500)
  }
})



app.get('/api/posts/:id/comments', async (c) => {
  const { id } = c.req.param()
  try {
    const { results } = await c.env.DB
      .prepare('SELECT * FROM comments WHERE post_id = ? ORDER BY date DESC')
      .bind(id).all()
    return c.json(results)
  } catch (err) {
    console.error('GET comments error:', err)
    return c.json({ error: 'Failed to fetch comments' }, 500)
  }
})

app.post('/api/posts/:id/comments', async (c) => {
  const { id } = c.req.param()
  let body
  try { body = await c.req.json() }
  catch { return c.json({ error: 'Invalid JSON body' }, 400) }

  const { name, content } = body
  if (!content?.trim()) return c.json({ error: 'content is required' }, 400)

  const date = new Date().toISOString()
  try {
    const { success, meta } = await c.env.DB
      .prepare('INSERT INTO comments (post_id, date, name, content) VALUES (?, ?, ?, ?)')
      .bind(id, date, name ?? 'Anonymous', content.trim())
      .run()
    if (!success) return c.json({ error: 'Failed to add comment' }, 500)
    return c.json({ message: 'Comment added', id: meta?.last_row_id ?? null }, 201)
  } catch (err) {
    console.error('POST comments error:', err)
    return c.json({ error: 'Failed to add comment' }, 500)
  }
})


app.notFound((c) => c.json({ error: 'Route not found' }, 404))

export default app
