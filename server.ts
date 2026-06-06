// server.ts
import "dotenv/config";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import { prisma } from "./prisma/prismaClient.js";

const app = express();
const PORT = parseInt(process.env.PORT || "5000", 10);

app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────────
// MIDDLEWARE: Simple Admin Auth Guard
// ─────────────────────────────────────────────
const ADMIN_KEY = process.env.ADMIN_SECRET_KEY || "supersecret123";

function adminAuth(req: Request, res: Response, next: NextFunction) {
  const key = req.headers["x-admin-key"];
  if (!key || key !== ADMIN_KEY) {
    res.status(401).json({ error: "Unauthorized. Invalid or missing admin key." });
    return;
  }
  next();
}

// ─────────────────────────────────────────────
// CATEGORY ROUTES
// ─────────────────────────────────────────────

// 1. GET ALL CATEGORIES
app.get("/api/categories", async (req: Request, res: Response) => {
  try {
    const dbCategories = await prisma.category.findMany();
    const formattedCategories = [
      { id: "all", label: "All Toys", slug: "all-toys", icon: "grid" },
      ...dbCategories,
    ];
    res.json({
      sectionTitle: "Explore Our Toy Universe",
      sectionSubtitle: "Find the perfect match for every age, interest, and developmental milestone.",
      categories: formattedCategories,
    });
  } catch (error: any) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ error: "Internal server error while retrieving categories." });
  }
});

// 2. CREATE CATEGORY (Admin only)
app.post("/api/categories", adminAuth, async (req: Request, res: Response) => {
  try {
    const { id, slug, label, icon } = req.body;
    if (!id || !slug || !label || !icon) {
      res.status(400).json({ error: "All fields are required: id, slug, label, icon." });
      return;
    }
    const category = await prisma.category.create({
      data: { id, slug, label, icon },
    });
    res.status(201).json({ message: "Category created successfully.", category });
  } catch (error: any) {
    console.error("Error creating category:", error);
    res.status(500).json({ error: "Internal server error while creating category." });
  }
});

// 3. UPDATE CATEGORY (Admin only)
app.put("/api/categories/:id", adminAuth, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { slug, label, icon } = req.body;
    const category = await prisma.category.update({
      where: { id },
      data: { slug, label, icon },
    });
    res.json({ message: "Category updated successfully.", category });
  } catch (error: any) {
    console.error("Error updating category:", error);
    res.status(500).json({ error: "Internal server error while updating category." });
  }
});

// 4. DELETE CATEGORY (Admin only)
app.delete("/api/categories/:id", adminAuth, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    await prisma.category.delete({ where: { id } });
    res.json({ message: `Category '${id}' deleted successfully.` });
  } catch (error: any) {
    console.error("Error deleting category:", error);
    res.status(500).json({ error: "Internal server error while deleting category." });
  }
});

// ─────────────────────────────────────────────
// PRODUCT ROUTES
// ─────────────────────────────────────────────

// 5. GET ALL PRODUCTS (with optional category filter)
app.get("/api/products", async (req: Request, res: Response) => {
  try {
    const categoryId = req.query.categoryId ? String(req.query.categoryId) : null;
    const whereClause: any = {};
    if (categoryId && categoryId !== "all") {
      whereClause.categoryId = categoryId;
    }
    const products = await prisma.product.findMany({ where: whereClause });
    res.json({ products });
  } catch (error: any) {
    console.error("Error fetching products:", error);
    res.status(500).json({ error: "Internal server error while retrieving products." });
  }
});

// 6. GET TOP SELLING PRODUCTS
// ⚠️ Must be defined BEFORE /api/products/:id
app.get("/api/products/top-selling", async (req: Request, res: Response) => {
  try {
    const topSellingProducts = await prisma.product.findMany({
      where: { isTopSelling: true },
      take: 6,
    });
    res.json({ topSelling: topSellingProducts });
  } catch (error: any) {
    console.error("Error fetching top selling products:", error);
    res.status(500).json({ error: "Internal server error while retrieving top sellers." });
  }
});

// 7. GET SINGLE PRODUCT
app.get("/api/products/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      res.status(404).json({ error: "Product not found." });
      return;
    }
    res.json({ product });
  } catch (error: any) {
    console.error("Error fetching product:", error);
    res.status(500).json({ error: "Internal server error while retrieving product." });
  }
});

// 8. CREATE PRODUCT (Admin only) ← ageRange + badge added
app.post("/api/products", adminAuth, async (req: Request, res: Response) => {
  try {
    const {
      title,
      categoryId,
      ageRange,   // 👈 NEW
      badge,      // 👈 NEW
      originalPrice,
      discountPrice,
      rating,
      reviewCount,
      imageUrl,
      isAvailable,
      isTopSelling,
    } = req.body;

    if (!title || !categoryId || !originalPrice || !discountPrice || !imageUrl) {
      res.status(400).json({
        error: "Required fields: title, categoryId, originalPrice, discountPrice, imageUrl.",
      });
      return;
    }

    const product = await prisma.product.create({
      data: {
        title: String(title),
        categoryId: String(categoryId),
        ageRange: ageRange ? String(ageRange) : "3+ Years",   // 👈 NEW
        badge: badge ? String(badge) : "",                     // 👈 NEW
        originalPrice: parseFloat(originalPrice),
        discountPrice: parseFloat(discountPrice),
        rating: rating ? parseFloat(rating) : 5.0,
        reviewCount: reviewCount ? parseInt(reviewCount) : 0,
        imageUrl: String(imageUrl),
        isAvailable: isAvailable ?? true,
        isTopSelling: isTopSelling ?? false,
      },
    });

    res.status(201).json({ message: "Product created successfully.", product });
  } catch (error: any) {
    console.error("Error creating product:", error);
    res.status(500).json({ error: "Internal server error while creating product." });
  }
});

// 9. UPDATE PRODUCT (Admin only) ← ageRange + badge added
app.put("/api/products/:id", adminAuth, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const {
      title,
      categoryId,
      ageRange,   // 👈 NEW
      badge,      // 👈 NEW
      originalPrice,
      discountPrice,
      rating,
      reviewCount,
      imageUrl,
      isAvailable,
      isTopSelling,
    } = req.body;

    const product = await prisma.product.update({
      where: { id },
      data: {
        ...(title && { title: String(title) }),
        ...(categoryId && { categoryId: String(categoryId) }),
        ...(ageRange && { ageRange: String(ageRange) }),           // 👈 NEW
        ...(badge !== undefined && { badge: String(badge) }),       // 👈 NEW
        ...(originalPrice && { originalPrice: parseFloat(originalPrice) }),
        ...(discountPrice && { discountPrice: parseFloat(discountPrice) }),
        ...(rating && { rating: parseFloat(rating) }),
        ...(reviewCount && { reviewCount: parseInt(reviewCount) }),
        ...(imageUrl && { imageUrl: String(imageUrl) }),
        ...(isAvailable !== undefined && { isAvailable }),
        ...(isTopSelling !== undefined && { isTopSelling }),
      },
    });

    res.json({ message: "Product updated successfully.", product });
  } catch (error: any) {
    console.error("Error updating product:", error);
    res.status(500).json({ error: "Internal server error while updating product." });
  }
});

// 10. DELETE PRODUCT (Admin only)
app.delete("/api/products/:id", adminAuth, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    await prisma.product.delete({ where: { id } });
    res.json({ message: `Product '${id}' deleted successfully.` });
  } catch (error: any) {
    console.error("Error deleting product:", error);
    res.status(500).json({ error: "Internal server error while deleting product." });
  }
});

// 11. Create uploads folder if it doesn't exist
const uploadsDir = "./uploads";
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// Multer config — save to /uploads with original extension
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    const valid = allowed.test(path.extname(file.originalname).toLowerCase());
    valid ? cb(null, true) : cb(new Error("Only images allowed"));
  },
});

// Serve uploaded images as static files
app.use("/uploads", express.static("uploads"));

// IMAGE UPLOAD ENDPOINT (Admin only)
// POST http://localhost:5000/api/upload
app.post("/api/upload", adminAuth, upload.single("image"), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: "No image file provided." });
    return;
  }
  const imageUrl = `http://localhost:5000/uploads/${req.file.filename}`;
  res.json({ imageUrl });
});

// ─────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────
app.get("/", (req: Request, res: Response) => {
  res.json({ status: "online", system: "ShopUs Toy Engine API" });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});