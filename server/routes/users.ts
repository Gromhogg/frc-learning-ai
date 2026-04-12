import { Hono } from "hono";
import { db } from "../../db/index.ts";
import { users } from "../../db/schema.ts";
import { asc, eq } from "drizzle-orm";

const app = new Hono();

app.get("/", async (c) => {
  const allUsers = await db.select().from(users).orderBy(asc(users.name));
  return c.json(allUsers);
});

app.post("/", async (c) => {
  const body = await c.req.json<{ name: string }>();
  const [newUser] = await db.insert(users).values({ name: body.name }).returning();
  return c.json(newUser, 201);
});

app.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  await db.delete(users).where(eq(users.id, id));
  return c.json({ ok: true });
});

export default app;
