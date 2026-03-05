import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono()

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Accept'],
}))

app.get('/', (c) => c.text('JOURNAL API — online'))

app.get('/api/posts', async (c) => {
  try {
    const { results } = await c.env.DB
      .prepare('SELECT * FROM posts ORDER BY id DESC')
      .all()
    return c.json(results)
  } catch {
    return c.json({ error: 'Failed to fetch posts' }, 500)
  }
})

app.get('/api/posts/:id', async (c) => {
  const { id } = c.req.param()
  try {
    const { results } = await c.env.DB
      .prepare('SELECT * FROM posts WHERE id = ?')
      .bind(id)
      .all()
    if (!results || results.length === 0) return c.json({ error: 'Post not found' }, 404)
    return c.json(results[0])
  } catch {
    return c.json({ error: 'Failed to fetch post' }, 500)
  }
})

app.post('/api/posts', async (c) => {
  let body
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }
  const { author, title, content } = body
  if (!title || !content) return c.json({ error: 'title and content are required' }, 400)
  try {
    const { success, meta } = await c.env.DB
      .prepare('INSERT INTO posts (author, title, content) VALUES (?, ?, ?)')
      .bind(author ?? 'Anonymous', title, content)
      .run()
    if (!success) return c.json({ error: 'Failed to create post' }, 500)
    return c.json({ message: 'Post created', id: meta?.last_row_id ?? null }, 201)
  } catch {
    return c.json({ error: 'Failed to create post' }, 500)
  }
})

app.delete('/api/posts/:id', async (c) => {
  const { id } = c.req.param()
  try {
    await c.env.DB.prepare('DELETE FROM comments WHERE post_id = ?').bind(id).run()
    const { success } = await c.env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(id).run()
    if (!success) return c.json({ error: 'Failed to delete post' }, 500)
    return c.json({ message: 'Post deleted' })
  } catch {
    return c.json({ error: 'Failed to delete post' }, 500)
  }
})

app.get('/api/posts/:id/comments', async (c) => {
  const { id } = c.req.param()
  try {
    const { results } = await c.env.DB
      .prepare('SELECT * FROM comments WHERE post_id = ? ORDER BY date DESC')
      .bind(id)
      .all()
    return c.json(results)
  } catch {
    return c.json({ error: 'Failed to fetch comments' }, 500)
  }
})

app.post('/api/posts/:id/comments', async (c) => {
  const { id } = c.req.param()
  let body
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }
  const { name, content } = body
  if (!content) return c.json({ error: 'content is required' }, 400)
  const date = new Date().toISOString()
  try {
    const { success, meta } = await c.env.DB
      .prepare('INSERT INTO comments (post_id, date, name, content) VALUES (?, ?, ?, ?)')
      .bind(id, date, name ?? 'Anonymous', content)
      .run()
    if (!success) return c.json({ error: 'Failed to add comment' }, 500)
    return c.json({ message: 'Comment added', id: meta?.last_row_id ?? null }, 201)
  } catch {
    return c.json({ error: 'Failed to add comment' }, 500)
  }
})

app.notFound((c) => c.json({ error: 'Route not found' }, 404))

export default app
