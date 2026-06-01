import { Hono } from "hono";
import { db } from "../../db/index.ts";
import { users, assessments } from "../../db/schema.ts";
import { asc, eq, sql } from "drizzle-orm";

const app = new Hono();

app.get("/", async (c) => {
  const allUsers = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      status: users.status,
      role: users.role,
      createdAt: users.createdAt,
      hasPassword: sql<number>`CASE WHEN ${users.passwordHash} IS NOT NULL THEN 1 ELSE 0 END`,
    })
    .from(users)
    .orderBy(asc(users.name));
  return c.json(allUsers);
});

app.post("/", async (c) => {
  const body = await c.req.json<{ name: string }>();
  const [newUser] = await db.insert(users).values({ name: body.name }).returning();
  return c.json(newUser, 201);
});

app.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  // Remove dependent assessments first — they FK-reference users.id
  await db.delete(assessments).where(eq(assessments.userId, id));
  await db.delete(users).where(eq(users.id, id));
  return c.json({ ok: true });
});

export default app;
