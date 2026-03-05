import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono()

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Accept', 'Authorization'],
}))

/* ── Session helpers ── */
const SESSION_MS = 8 * 60 * 60 * 1000

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

/* ── Auth middleware ── */
async function requireAuth(c, next) {
  const header = c.req.header('Authorization') || ''
  const token  = header.startsWith('Bearer ') ? header.slice(7).trim() : null
  const user   = await verifySession(c.env.DB, token)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  c.set('user', user)
  await next()
}

/* ── Rate limiter ── */
const attempts = new Map()
function rateLimit(ip) {
  const now = Date.now(), win = 15 * 60 * 1000, max = 10
  const r = attempts.get(ip) || { n: 0, t: now }
  if (now - r.t > win) { attempts.set(ip, { n: 1, t: now }); return false }
  r.n++; attempts.set(ip, r)
  return r.n > max
}

/* ── Routes ── */
app.get('/', c => c.text('JOURNAL API — online'))

app.post('/api/auth/login', async c => {
  const ip = c.req.header('CF-Connecting-IP') || 'unknown'
  if (rateLimit(ip)) return c.json({ error: 'Too many attempts — try again in 15 minutes' }, 429)

  let body
  try { body = await c.req.json() }
  catch { return c.json({ error: 'Invalid JSON' }, 400) }

  const username = String(body.username || '').trim().slice(0, 64)
  const password = String(body.password || '').slice(0, 128)
  if (!username || !password) return c.json({ error: 'username and password required' }, 400)

  try {
    const row = await c.env.DB
      .prepare('SELECT id, username, password FROM auth WHERE username = ?')
      .bind(username).first()

    if (!row || row.password !== password) {
      await new Promise(r => setTimeout(r, 500))
      return c.json({ error: 'Invalid credentials' }, 401)
    }

    const token = await createSession(c.env.DB, row.username)
    return c.json({ token, username: row.username })

  } catch (err) {
    console.error('Login error:', err)
    return c.json({ error: 'Authentication error' }, 500)
  }
})

app.get('/api/auth/verify', async c => {
  const header = c.req.header('Authorization') || ''
  const token  = header.startsWith('Bearer ') ? header.slice(7).trim() : null
  const user   = await verifySession(c.env.DB, token)
  if (!user) return c.json({ error: 'Invalid or expired session' }, 401)
  return c.json({ ok: true, username: user })
})

app.post('/api/auth/logout', async c => {
  const header = c.req.header('Authorization') || ''
  const token  = header.startsWith('Bearer ') ? header.slice(7).trim() : null
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run()
  return c.json({ ok: true })
})

app.get('/api/posts', async c => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM posts ORDER BY id DESC').all()
    return c.json(results)
  } catch (err) {
    console.error(err)
    return c.json({ error: 'Failed to fetch posts' }, 500)
  }
})

app.get('/api/posts/:id', async c => {
  const { id } = c.req.param()
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).all()
    if (!results?.length) return c.json({ error: 'Post not found' }, 404)
    return c.json(results[0])
  } catch (err) {
    console.error(err)
    return c.json({ error: 'Failed to fetch post' }, 500)
  }
})

app.post('/api/posts', requireAuth, async c => {
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
  } catch (err) {
    console.error(err)
    return c.json({ error: 'Failed to create post' }, 500)
  }
})

app.delete('/api/posts/:id', requireAuth, async c => {
  const { id } = c.req.param()
  try {
    await c.env.DB.prepare('DELETE FROM comments WHERE post_id = ?').bind(id).run()
    const { success } = await c.env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(id).run()
    if (!success) return c.json({ error: 'Failed to delete post' }, 500)
    return c.json({ message: 'Post deleted' })
  } catch (err) {
    console.error(err)
    return c.json({ error: 'Failed to delete post' }, 500)
  }
})

app.get('/api/posts/:id/comments', async c => {
  const { id } = c.req.param()
  try {
    const { results } = await c.env.DB
      .prepare('SELECT * FROM comments WHERE post_id = ? ORDER BY date DESC')
      .bind(id).all()
    return c.json(results)
  } catch (err) {
    console.error(err)
    return c.json({ error: 'Failed to fetch comments' }, 500)
  }
})

app.post('/api/posts/:id/comments', async c => {
  const { id } = c.req.param()
  let body
  try { body = await c.req.json() }
  catch { return c.json({ error: 'Invalid JSON' }, 400) }

  const { name, content } = body
  if (!content?.trim()) return c.json({ error: 'content is required' }, 400)

  try {
    const { success, meta } = await c.env.DB
      .prepare('INSERT INTO comments (post_id, date, name, content) VALUES (?, ?, ?, ?)')
      .bind(id, new Date().toISOString(), name ?? 'Anonymous', content.trim())
      .run()
    if (!success) return c.json({ error: 'Failed to add comment' }, 500)
    return c.json({ message: 'Comment added', id: meta?.last_row_id ?? null }, 201)
  } catch (err) {
    console.error(err)
    return c.json({ error: 'Failed to add comment' }, 500)
  }
})

app.notFound(c => c.json({ error: 'Route not found' }, 404))

export default app
