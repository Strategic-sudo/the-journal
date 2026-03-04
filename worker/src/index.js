import { Hono } from 'hono'
const app = new Hono()

// sha-256
async function hashPassword(password) {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hash = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
}




// authentication for th e  middleware
async function authMiddleware(c, next) {
  const authHeader = c.req.header("Authorization")
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return c.json({ error: "Unauthorized" }, 401)
  }

  try {
    const base64 = authHeader.split(" ")[1]
    const decoded = atob(base64)
    const [username, password] = decoded.split(":")
    if (!username || !password) return c.json({ error: "Invalid credentials format" }, 400)

    const { results } = await c.env.DB.prepare(
      `SELECT id, password FROM auth WHERE username = ?`
    )
      .bind(username)
      .all()

    if (!results || results.length === 0) return c.json({ error: "Forbidden" }, 403)

    const user = results[0]
    const hashedInput = await hashPassword(password)

    if (hashedInput !== user.password) return c.json({ error: "Forbidden" }, 403)

    c.set("userId", user.id)
    await next()
  } catch (err) {
    return c.json({ error: "Authentication error" }, 500)
  }
}



// base route
app.get('/', (c) => c.text('Hono Secure Blog API'))




// read a single post
app.get("/api/posts/:slug", async (c) => {
  const { slug } = c.req.param()
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM posts WHERE id = ?`
  ).bind(slug).all()
  return c.json(results)
})





// dead all posts
app.get("/api/posts", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM posts ORDER BY id DESC`
  ).all()
  return c.json(results)
})






// create post (protected)
app.post("/api/posts", authMiddleware, async (c) => {
  const userId = c.get("userId")
  const { title, content } = await c.req.json()

  if (!title || !content) return c.json({ error: "Missing fields" }, 400)

  const { success } = await c.env.DB.prepare(
    `INSERT INTO posts (author, title, content) VALUES (?, ?, ?)`
  ).bind(userId, title, content).run()

  if (!success) return c.json({ error: "Failed to create post" }, 500)

  return c.json({ message: "Post created successfully" })
})







// delete post (protected)
app.delete("/api/posts/:id", authMiddleware, async (c) => {
  const userId = c.get("userId")
  const { id } = c.req.param()

  const { success } = await c.env.DB.prepare(
    `DELETE FROM posts WHERE id = ? AND author = ?`
  ).bind(id, userId).run()

  if (!success) return c.json({ error: "Delete failed or not owner" }, 403)

  return c.json({ message: "Post deleted" })
})







// add comment
app.post("/api/posts/:id/comments", async (c) => {
  const { id } = c.req.param()
  const { name, content } = await c.req.json()
  if (!name || !content) return c.json({ error: "Missing fields" }, 400)

  const date = new Date().toISOString()
  const { success } = await c.env.DB.prepare(
    `INSERT INTO comments (post_id, date, name, content) VALUES (?, ?, ?, ?)`
  ).bind(id, date, name, content).run()

  if (!success) return c.json({ error: "Failed to add comment" }, 500)

  return c.json({ message: "Comment added" })
})






// read comments
app.get("/api/posts/:id/comments", async (c) => {
  const { id } = c.req.param()
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM comments WHERE post_id = ? ORDER BY date DESC`
  ).bind(id).all()
  return c.json(results)
})

export default app
