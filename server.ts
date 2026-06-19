// server.ts
import "dotenv/config";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import { cloudinary } from "./lib/cloudinary.js";
import { prisma } from "./prisma/prismaClient.js";

const JWT_SECRET = process.env.JWT_SECRET || "jwt_secret_change_in_prod";

const app = express();
const PORT = parseInt(process.env.PORT || "5000", 10);

const allowedOrigins = [
  "http://localhost:3000",
  "https://miniatures-frontend.vercel.app",
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));
app.use(express.json());

// ─────────────────────────────────────────────
// MIDDLEWARE
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

interface AuthRequest extends Request {
  userId?: string;
}

// Requires a valid token — rejects if missing or invalid
function userAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized. Bearer token required." });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token." });
  }
}

// Decodes token if present, but does NOT reject — allows guest requests through
function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const authHeader = req.headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) {
    try {
      const payload = jwt.verify(authHeader.slice(7), JWT_SECRET) as { userId: string };
      req.userId = payload.userId;
    } catch {
      // invalid token — treat as guest
    }
  }
  next();
}

// ─────────────────────────────────────────────
// AUTH ROUTES
// ─────────────────────────────────────────────

// POST /api/auth/register
app.post("/api/auth/register", async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      res.status(400).json({ error: "Required: name, email, password." });
      return;
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: "Email already registered." });
      return;
    }
    const hashed = await bcrypt.hash(String(password), 10);
    const user = await prisma.user.create({
      data: { name: String(name), email: String(email), password: hashed },
    });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });
    res.status(201).json({ user: { id: user.id, name: user.name, email: user.email }, token });
  } catch (error: any) {
    console.error("Error registering user:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// POST /api/auth/login
app.post("/api/auth/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: "Required: email, password." });
      return;
    }
    const user = await prisma.user.findUnique({ where: { email: String(email) } });
    if (!user) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }
    const valid = await bcrypt.compare(String(password), user.password);
    if (!valid) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ user: { id: user.id, name: user.name, email: user.email }, token });
  } catch (error: any) {
    console.error("Error logging in:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

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



// Cloudinary storage config — uploads go directly to Cloudinary, not local disk
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "miniaturestoys-products", // organizes uploads in this folder on Cloudinary
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [{ width: 1000, height: 1000, crop: "limit" }], // auto-resize large images
  } as any,
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
});

// IMAGE UPLOAD ENDPOINT (Admin only)
// POST http://localhost:5000/api/upload
app.post("/api/upload", adminAuth, upload.single("image"), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: "No image file provided." });
    return;
  }

  // Cloudinary gives back a permanent HTTPS URL in req.file.path
  const imageUrl = (req.file as any).path;
  res.json({ imageUrl });
});

// ─────────────────────────────────────────────
// ORDER ROUTES
// ─────────────────────────────────────────────

function generateOrderNumber(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 12. PLACE ORDER (Public — called by frontend checkout)
// POST /api/orders
// Body: { customerName, customerEmail, customerPhone?, address?, items: [{ productId, quantity, price }], userId? }
app.post("/api/orders", optionalAuth as any, async (req: AuthRequest, res: Response) => {
  try {
    const { customerName, customerEmail, customerPhone, address, items } = req.body;

    if (!customerName || !customerEmail || !items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: "Required: customerName, customerEmail, items (array)." });
      return;
    }

    const totalAmount = items.reduce(
      (sum: number, item: { price: number; quantity: number }) => sum + item.price * item.quantity,
      0
    );

    const userId = req.userId; // decoded from Bearer token, null for guests

    const order = await prisma.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        customerName: String(customerName),
        customerEmail: String(customerEmail),
        customerPhone: customerPhone ? String(customerPhone) : null,
        address: address ? String(address) : null,
        totalAmount,
        ...(userId && { userId }),
        items: {
          create: items.map((item: { productId: string; quantity: number; price: number }) => ({
            productId: String(item.productId),
            quantity: Number(item.quantity),
            price: Number(item.price),
          })),
        },
      },
      include: { items: { include: { product: true } } },
    });

    res.status(201).json({ message: "Order placed successfully.", order });
  } catch (error: any) {
    console.error("Error placing order:", error);
    res.status(500).json({ error: "Internal server error while placing order." });
  }
});

// 13. GET MY ORDERS (Logged-in user)
// GET /api/orders/my  — Bearer token required
app.get("/api/orders/my", userAuth as any, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
    const orders = await prisma.order.findMany({
      where: { userId },
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ orders });
  } catch (error: any) {
    console.error("Error fetching user orders:", error);
    res.status(500).json({ error: "Internal server error while retrieving your orders." });
  }
});

// 14. GET ALL ORDERS (Admin only)
// GET /api/orders?status=pending
app.get("/api/orders", adminAuth, async (req: Request, res: Response) => {
  try {
    const status = req.query.status ? String(req.query.status) : null;
    const orders = await prisma.order.findMany({
      ...(status && { where: { status } }),
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ orders });
  } catch (error: any) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ error: "Internal server error while retrieving orders." });
  }
});

// 14. TRACK ORDER (Public — limited fields only)
// GET /api/orders/track/:id
app.get("/api/orders/track/:orderNumber", async (req: Request, res: Response) => {
  try {
    const input = String(req.params.orderNumber);
    // Frontend derives 8-char code from the last 8 chars of the cuid (uppercase)
    // So we search by orderNumber OR by id ending with those chars
    const order = await prisma.order.findFirst({
      where: {
        OR: [
          { orderNumber: input.toUpperCase() },
          { id: { endsWith: input.toLowerCase(), mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        customerName: true,
        address: true,
        totalAmount: true,
        createdAt: true,
      },
    });
    if (!order) {
      res.status(404).json({ error: "Order not found." });
      return;
    }
    res.json({ order });
  } catch (error: any) {
    console.error("Error tracking order:", error);
    res.status(500).json({ error: "Internal server error while tracking order." });
  }
});

// 15. GET SINGLE ORDER (Admin only)
app.get("/api/orders/:id", adminAuth, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const order = await prisma.order.findUnique({
      where: { id },
      include: { items: { include: { product: true } } },
    });
    if (!order) {
      res.status(404).json({ error: "Order not found." });
      return;
    }
    res.json({ order });
  } catch (error: any) {
    console.error("Error fetching order:", error);
    res.status(500).json({ error: "Internal server error while retrieving order." });
  }
});

// 15. UPDATE ORDER STATUS (Admin only)
// PATCH /api/orders/:id/status
// Body: { status: "pending" | "confirmed" | "shipped" | "delivered" | "cancelled" }
app.put("/api/orders/:id/status", adminAuth, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { status } = req.body;
    const validStatuses = ["pending", "confirmed", "shipped", "delivered", "cancelled"];
    if (!status || !validStatuses.includes(status)) {
      res.status(400).json({ error: `Status must be one of: ${validStatuses.join(", ")}` });
      return;
    }
    const order = await prisma.order.update({
      where: { id },
      data: { status },
      include: { items: { include: { product: true } } },
    });
    res.json({ message: "Order status updated.", order });
  } catch (error: any) {
    console.error("Error updating order status:", error);
    res.status(500).json({ error: "Internal server error while updating order status." });
  }
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