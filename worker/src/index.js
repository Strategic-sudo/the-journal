import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono()


app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Accept', 'Authorization'],
}))


async function verifyPassword(password, stored) {
  try {
    const parts = stored.split('$')
    if (parts.length !== 3 || parts[0] !== 'pbkdf2') return false
    const saltHex = parts[1], hashHex = parts[2]
    const salt   = new Uint8Array(saltHex.match(/.{2}/g).map(h => parseInt(h, 16)))
    const keyMat = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
    )
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600_000 }, keyMat, 256
    )
    const toHex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('')
    return toHex(new Uint8Array(bits)) === hashHex
  } catch { return false }
}


const SESSION_HOURS = 8
const SESSION_MS    = SESSION_HOURS * 60 * 60 * 1000

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return [...bytes].map(b => b.toString(16).padStart(2,'0')).join('')
}

async function createSession(db, username) {
  const token   = randomToken()
  const expires = Date.now() + SESSION_MS
  await db.prepare('INSERT INTO sessions (token, username, expires) VALUES (?, ?, ?)')
    .bind(token, username, expires).run()
  return token
}

async function verifySession(db, token) {
  if (!token) return null
  const row = await db.prepare('SELECT username, expires FROM sessions WHERE token = ?')
    .bind(token).first()
  if (!row) return null
  if (row.expires < Date.now()) {
    
    await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run()
    return null
  }
  return row.username
}


async function requireAuth(c, next) {
  const authHeader = c.req.header('Authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
  if (!token) return c.json({ error: 'Unauthorized — no token' }, 401)

  const username = await verifySession(c.env.DB, token)
  if (!username) return c.json({ error: 'Unauthorized — invalid or expired session' }, 401)

  c.set('user', username)
  await next()
}


const loginAttempts = new Map()

function checkRateLimit(ip) {
  const now = Date.now(), window = 15 * 60 * 1000, max = 10
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
  if (checkRateLimit(ip)) return c.json({ error: 'Too many attempts — try again in 15 minutes' }, 429)

  let body
  try { body = await c.req.json() }
  catch { return c.json({ error: 'Invalid JSON' }, 400) }

  const username = String(body.username || '').trim().slice(0, 64)
  const password = String(body.password || '').slice(0, 128)
  if (!username || !password) return c.json({ error: 'username and password required' }, 400)

  try {
    const row = await c.env.DB
      .prepare('SELECT id, username, hash, password FROM auth WHERE username = ?')
      .bind(username).first()

    
    const storedHash = row ? (row.hash || '') : ''
    const dummy = 'pbkdf2$0000000000000000000000000000000000$' +
                  '0000000000000000000000000000000000000000000000000000000000000000'

    const valid = storedHash
      ? await verifyPassword(password, storedHash)
      : (await verifyPassword(password, dummy), false)

    if (!valid) {
      await new Promise(r => setTimeout(r, 600 + Math.random() * 400))
      return c.json({ error: 'Invalid credentials' }, 401)
    }

    
    const token = await createSession(c.env.DB, row.username)
    return c.json({ token, username: row.username })

  } catch (err) {
    console.error('Login error:', err)
    return c.json({ error: 'Authentication error' }, 500)
  }
})


app.get('/api/auth/verify', async (c) => {
  const authHeader = c.req.header('Authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
  const username = await verifySession(c.env.DB, token)
  if (!username) return c.json({ error: 'Invalid or expired session' }, 401)
  return c.json({ ok: true, username })
})


app.post('/api/auth/logout', async (c) => {
  const authHeader = c.req.header('Authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
  if (token) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run()
  }
  return c.json({ ok: true })
})


app.get('/api/posts', async (c) => {
  try {
    const { results } = await c.env.DB
      .prepare('SELECT * FROM posts ORDER BY id DESC').all()
    return c.json(results)
  } catch (err) {
    console.error('GET /api/posts:', err)
    return c.json({ error: 'Failed to fetch posts' }, 500)
  }
})

app.get('/api/posts/:id', async (c) => {
  const { id } = c.req.param()
  try {
    const { results } = await c.env.DB
      .prepare('SELECT * FROM posts WHERE id = ?').bind(id).all()
    if (!results?.length) return c.json({ error: 'Post not found' }, 404)
    return c.json(results[0])
  } catch (err) {
    console.error('GET /api/posts/:id:', err)
    return c.json({ error: 'Failed to fetch post' }, 500)
  }
})


app.post('/api/posts', requireAuth, async (c) => {
  let body
  try { body = await c.req.json() }
  catch { return c.json({ error: 'Invalid JSON' }, 400) }

  const { author, title, content, category, excerpt } = body
  if (!title?.trim() || !content?.trim()) return c.json({ error: 'title and content required' }, 400)

  try {
    const { success, meta } = await c.env.DB
      .prepare('INSERT INTO posts (author, title, content, category, excerpt) VALUES (?, ?, ?, ?, ?)')
      .bind(author ?? 'Staff', title.trim(), content.trim(), category ?? 'GEOPOLITICS', excerpt ?? '')
      .run()
    if (!success) return c.json({ error: 'Failed to create post' }, 500)
    return c.json({ message: 'Post created', id: meta?.last_row_id ?? null }, 201)
  } catch {
    
    try {
      const { success, meta } = await c.env.DB
        .prepare('INSERT INTO posts (author, title, content) VALUES (?, ?, ?)')
        .bind(author ?? 'Staff', title.trim(), content.trim()).run()
      if (!success) return c.json({ error: 'Failed to create post' }, 500)
      return c.json({ message: 'Post created', id: meta?.last_row_id ?? null }, 201)
    } catch (err2) {
      console.error('POST /api/posts:', err2)
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
    console.error('DELETE /api/posts/:id:', err)
    return c.json({ error: 'Failed to delete post' }, 500)
  }
})


app.get('/api/posts/:id/comments', async (c) => {
  const { id } = c.req.param()
  try {
    const { results } = await c.env.DB
      .prepare('SELECT * FROM comments WHERE post_id = ? ORDER BY date DESC').bind(id).all()
    return c.json(results)
  } catch (err) {
    console.error('GET comments:', err)
    return c.json({ error: 'Failed to fetch comments' }, 500)
  }
})

app.post('/api/posts/:id/comments', async (c) => {
  const { id } = c.req.param()
  let body
  try { body = await c.req.json() }
  catch { return c.json({ error: 'Invalid JSON' }, 400) }

  const { name, content } = body
  if (!content?.trim()) return c.json({ error: 'content is required' }, 400)

  const date = new Date().toISOString()
  try {
    const { success, meta } = await c.env.DB
      .prepare('INSERT INTO comments (post_id, date, name, content) VALUES (?, ?, ?, ?)')
      .bind(id, date, name ?? 'Anonymous', content.trim()).run()
    if (!success) return c.json({ error: 'Failed to add comment' }, 500)
    return c.json({ message: 'Comment added', id: meta?.last_row_id ?? null }, 201)
  } catch (err) {
    console.error('POST comments:', err)
    return c.json({ error: 'Failed to add comment' }, 500)
  }
})


app.notFound((c) => c.json({ error: 'Route not found' }, 404))

export default app
