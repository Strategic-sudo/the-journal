import { Hono } from 'hono'
const app = new Hono()





app.get("/api/posts/:slug", async (c) => {
  const { slug } = c.req.param();
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM posts WHERE id = ?`
  )
    .bind(slug)
    .run();
  return c.json(results);
});




app.post("/api/posts/:slug", async (c) => {
  // Do something and return an HTTP response
  // Optionally, do something with `c.req.param("slug")`
});




app.get('/', (c) => c.text('Hono!'));







app.post("/api/posts", async (c) => {
  const { author, title, content } = await c.req.json();

  const { success } = await c.env.DB.prepare(
    `INSERT INTO posts (author, title, content) VALUES (?, ?, ?)`
  )
    .bind(author, title, content)
    .run();

  if (!success) {
    return c.json({ error: "Failed to create post" }, 500);
  }

  return c.json({ message: "Post created successfully" });
});







app.get("/api/posts", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM posts ORDER BY id DESC`
  ).all();

  return c.json(results);
});





app.delete("/api/posts/:id", async (c) => {
  const { id } = c.req.param();

  const { success } = await c.env.DB.prepare(
    `DELETE FROM posts WHERE id = ?`
  )
    .bind(id)
    .run();

  if (!success) {
    return c.json({ error: "Failed to delete post" }, 500);
  }

  return c.json({ message: "Post deleted" });
});






app.post("/api/posts/:id/comments", async (c) => {
  const { id } = c.req.param();
  const { name, content } = await c.req.json();
  const date = new Date().toISOString();

  const { success } = await c.env.DB.prepare(
    `INSERT INTO comments (post_id, date, name, content)
     VALUES (?, ?, ?, ?)`
  )
    .bind(id, date, name, content)
    .run();

  if (!success) {
    return c.json({ error: "Failed to add comment" }, 500);
  }

  return c.json({ message: "Comment added" });
});








app.get("/api/posts/:id/comments", async (c) => {
  const { id } = c.req.param();

  const { results } = await c.env.DB.prepare(
    `SELECT * FROM comments WHERE post_id = ? ORDER BY date DESC`
  )
    .bind(id)
    .all();

  return c.json(results);
});

export default app
