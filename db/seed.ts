import { db } from "./index";
import { users, topics, assessments } from "./schema";

async function seed() {
  // Clear tables in dependency order
  await db.delete(assessments);
  await db.delete(users);
  await db.delete(topics);

  // Seed users
  const teamMembers = [
    { name: "Alex Rivera" },
    { name: "Jordan Chen" },
    { name: "Maya Patel" },
    { name: "Ethan Brooks" },
    { name: "Sophia Nguyen" },
    { name: "Marcus Johnson" },
    { name: "Lily Okonkwo" },
    { name: "Daniel Kim" },
    { name: "Priya Sharma" },
    { name: "Tyler Hernandez" },
  ];

  await db.insert(users).values(teamMembers);

  // Seed topics
  const topicData = [
    {
      name: "Mill Operation",
      slug: "mill-operation",
      filePath: "knowledge/mill-operation.txt",
    },
    {
      name: "Lathe Operation",
      slug: "lathe-operation",
      filePath: "knowledge/lathe-operation.txt",
    },
  ];

  await db.insert(topics).values(topicData);

  console.log("Seed complete:");
  console.log(`  - ${teamMembers.length} users inserted`);
  console.log(`  - ${topicData.length} topics inserted`);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
