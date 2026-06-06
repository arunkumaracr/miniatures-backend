// prisma/seed.ts
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config"; 

// 🎯 1. Initialize the raw pg pool connection using your .env string
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// 🎯 2. Wrap it inside Prisma's official Driver Adapter
const adapter = new PrismaPg(pool);

// 🎯 3. Pass the adapter straight into the Prisma Client constructor
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Cleaning up any existing tables...");
  await prisma.product.deleteMany({});
  await prisma.category.deleteMany({});

  console.log("🌱 Injecting brand new categories...");
  
  const stemCategory = await prisma.category.create({
    data: {
      id: "stem",
      slug: "stem-science",
      label: "STEM & Science",
      icon: "Rocket",
    },
  });

  const puzzlesCategory = await prisma.category.create({
    data: {
      id: "puzzles",
      slug: "puzzles-blocks",
      label: "Puzzles & Blocks",
      icon: "Puzzle",
    },
  });

  console.log("🌱 Populating dynamic inventory items...");

  await prisma.product.createMany({
    data: [
      {
        id: "prod_01",
        title: "Retro Space Cadet Action Figure Set",
        categoryId: stemCategory.id,
        originalPrice: 19.99,
        discountPrice: 13.99,
        rating: 5.0,
        reviewCount: 94,
        imageUrl: "https://images.unsplash.com/photo-1566577134770-3d85bb3a9cc4?auto=format&fit=crop&q=80&w=500",
        isAvailable: true,
        isTopSelling: true,
      },
      {
        id: "prod_02",
        title: "3D Crystal Miniature Castle Block Assembly Kit",
        categoryId: puzzlesCategory.id,
        originalPrice: 15.99,
        discountPrice: 8.99,
        rating: 4.5,
        reviewCount: 47,
        imageUrl: "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&q=80&w=500",
        isAvailable: true,
        isTopSelling: false,
      }
    ],
  });

  console.log("✨ Cloud Database tables fully seeded!");
}

main()
  .catch((e) => {
    console.error("❌ Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    // Safely close down the database socket pool
    await pool.end();
  });