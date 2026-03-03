import { Hono } from 'hono'
const app = new Hono()


app.get("/api/posts/:slug", async (c) => {
  // Do something and return an HTTP response
  // Optionally, do something with `c.req.param("slug")`
});

app.post("/api/posts/:slug", async (c) => {
  // Do something and return an HTTP response
  // Optionally, do something with `c.req.param("slug")`
});


app.get('/', (c) => c.text('Hono!'))



export default app
