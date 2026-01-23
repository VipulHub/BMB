import { fileURLToPath } from "url";
import supabase from "../config/db.config.ts";
import { emitter } from "../utils/emiter.ts";
import fs from "fs";
import path from "path";
import { generateOTP } from "../utils/utils.ts";

/* ===============================
   ESM __dirname FIX
================================ */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ===============================
   LOCAL IMAGE PATHS
================================ */
const productImages = [
  path.join(__dirname, "../public/images/pure1.png"),
  path.join(__dirname, "../public/images/pure2.png"),
  path.join(__dirname, "../public/images/pure3.png"),
  path.join(__dirname, "../public/images/original1.png"),
  path.join(__dirname, "../public/images/original2.png"),
  path.join(__dirname, "../public/images/original3.png"),
  path.join(__dirname, "../public/images/chocolate1.png"),
  path.join(__dirname, "../public/images/chocolate2.png"),
  path.join(__dirname, "../public/images/chocolate3.png"),
];

const blogImages = [
  path.join(__dirname, "../public/images/pure1.png"),
  path.join(__dirname, "../public/images/original1.png"),
  path.join(__dirname, "../public/images/chocolate1.png"),
];

const userImages = [
  path.join(__dirname, "../public/images/chocolate1.png"),
  path.join(__dirname, "../public/images/chocolate2.png"),
  path.join(__dirname, "../public/images/chocolate3.png"),
];

/* ===============================
   STORAGE HELPERS
================================ */
async function ensureBucketExists(bucket: string) {
  const { data } = await supabase.storage.getBucket(bucket);
  if (!data) {
    const { error } = await supabase.storage.createBucket(bucket, { public: true });
    if (error) throw error;
  }
}

async function uploadToStorage(localPath: string, bucket: string) {
  await ensureBucketExists(bucket);
  const fileName = `${Date.now()}-${path.basename(localPath)}`;
  const buffer = fs.readFileSync(localPath);
  const { error } = await supabase.storage.from(bucket).upload(fileName, buffer, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
  return data.publicUrl;
}

/* ===============================
   CREATE TABLES
================================ */
async function createTables() {
  const { error } = await supabase.rpc("exec_sql", {
    sql: `
      do $$ begin
        if not exists (select 1 from pg_type where typname = 'user_role') then
          create type user_role as enum ('user', 'admin');
        end if;

        if not exists (select 1 from pg_type where typname = 'product_size') then
          create type product_size as enum ('small', 'large', 'largest');
        end if;
      end $$;

      create extension if not exists "pgcrypto";

      create table if not exists api_log (
        id uuid primary key default gen_random_uuid(),
        created_at timestamp default now(),
        endpoint text,
        method text,
        status_code int,
        response_time numeric,
        ip_address text,
        upload_at timestamp
      );

      create table if not exists app_errors (
        id uuid primary key default gen_random_uuid(),
        created_at timestamp default now(),
        error_message text,
        stack_trace text,
        method_name text,
        level text
      );

      create table if not exists users (
        id uuid primary key default gen_random_uuid(),
        created_at timestamp default now(),
        name text,
        email text unique,
        type user_role not null default 'user',
        phone_number text,
        address text,
        image_url text
      );

      create table if not exists user_otps (
        id uuid primary key default gen_random_uuid(),
        user_id uuid references users(id) on delete cascade,
        otp text not null,
        created_at timestamptz default now(),
        expires_at timestamptz default (now() + interval '5 minutes')
      );

      create table if not exists products (
        id uuid primary key default gen_random_uuid(),
        created_at timestamp default now(),
        user_id uuid references users(id) on delete cascade,
        name text not null,
        description text,
        price numeric(10,2) not null,
        stock int default 0,
        product_type text,
        sizes product_size[] default '{}',
        image_urls text[] default '{}'
      );

      create table if not exists wishlist (
        id uuid primary key default gen_random_uuid(),
        user_id uuid references users(id) on delete cascade,
        product_ids uuid[] default '{}',
        created_at timestamp default now()
      );

      create table if not exists carts (
        id uuid primary key default gen_random_uuid(),
        created_at timestamp default now(),
        user_id uuid unique references users(id) on delete cascade,
        session_id text unique,
        items jsonb default '[]'::jsonb,
        product_count int default 0,
        total_price numeric(10,2) default 0,
        constraint cart_owner_check check (user_id is not null or session_id is not null)
      );

      create table if not exists payment_methods (
        id uuid primary key default gen_random_uuid(),
        created_at timestamp default now(),
        user_id uuid references users(id) on delete cascade,
        card_number text,
        expiry_date text,
        cardholder_name text,
        brand text
      );

      CREATE TABLE IF NOT EXISTS orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),      -- internal order ID
    created_at timestamp DEFAULT now(),
    user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    status text DEFAULT 'pending',
    total_amount numeric(10,2),
    product_ids uuid[] DEFAULT '{}',
    product_count int DEFAULT 0,

    -- Internal payment method (optional)
    payment_method_id uuid REFERENCES payment_methods(id),

    -- Razorpay integration columns
    razorpay_order_id text,     -- stores Razorpay order ID
    razorpay_payment_id text    -- stores Razorpay payment ID
);


      create table if not exists order_payment_history (
        id uuid primary key default gen_random_uuid(),
        order_id uuid references orders(id) on delete cascade,
        created_at timestamp default now(),
        amount numeric(10,2),
        method_used text,
        status text
      );

      create table if not exists discount_coupons (
        id uuid primary key default gen_random_uuid(),
        created_at timestamp default now(),
        created_by uuid references users(id) on delete set null,
        coupon_code text unique not null,
        title text,
        description text,
        discount_percent numeric(5,2),
        valid_from date,
        valid_to date,
        product_id uuid references products(id) on delete cascade,
        product_type text,
        is_active boolean default true
      );

      create table if not exists shipping_details (
        id uuid primary key default gen_random_uuid(),
        order_id uuid references orders(id) on delete cascade,
        created_at timestamp default now(),
        status text,
        location text,
        expected_delivery date,
        tracking_number text
      );

      create table if not exists blogs (
        id uuid primary key default gen_random_uuid(),
        user_id uuid references users(id) on delete cascade,
        created_at timestamp default now(),
        header text not null,
        subheader1 text,
        paragraph1 text,
        subheader2 text,
        paragraph2 text,
        image_urls text[] default '{}'
      );

      -- 🔥 NEW TABLE (ONLY ADDITION)
      create table if not exists user_addresses (
        id uuid primary key default gen_random_uuid(),
        user_id uuid references users(id) on delete cascade,
        full_name text not null,
        phone_number text,
        address_line1 text not null,
        address_line2 text,
        city text not null,
        state text not null,
        country text not null,
        postal_code text not null,
        is_active boolean default true,
        is_default boolean default false,
        created_at timestamp default now()
      );
    `,
  });

  if (error) console.error("❌ Error creating tables:", error);
  else emitter.emit("log", { msg: "✅ Tables created successfully", level: "info" });
}

/* ===============================
   DROP ALL TABLES (UNCHANGED)
================================ */
async function dropAllTables() {
  const { error } = await supabase.rpc("exec_sql", {
    sql: `
      drop table if exists user_addresses cascade;
      drop table if exists shipping_details cascade;
      drop table if exists discount_coupons cascade;
      drop table if exists order_payment_history cascade;
      drop table if exists orders cascade;
      drop table if exists payment_methods cascade;
      drop table if exists carts cascade;
      drop table if exists wishlist cascade;
      drop table if exists blogs cascade;
      drop table if exists products cascade;
      drop table if exists users cascade;
      drop table if exists app_errors cascade;
      drop table if exists api_log cascade;
      drop table if exists user_otps cascade;

      drop type if exists user_role cascade;
      drop type if exists product_size cascade;
      drop extension if exists "pgcrypto";
    `,
  });

  if (error) console.error("❌ Error dropping database objects:", error);
  else emitter.emit("log", { msg: "🧹 Database fully reset", level: "info" });
}

/* ===============================
   SEED DATABASE
================================ */
async function seedDatabase() {
  try {
    /* ---------- USERS ---------- */
    const { data: existingUsers } = await supabase.from("users").select("*");
    let adminId: string;

    if (!existingUsers?.length) {
      const userImageUrls: string[] = [];
      for (const img of userImages) {
        userImageUrls.push(await uploadToStorage(img, "users"));
      }

      const { data: users, error }: any = await supabase
        .from("users")
        .upsert(
          [
            {
              name: "Admin",
              email: "admin@example.com",
              type: "admin",
              image_url: userImageUrls[0],
            },
            {
              name: "User One",
              email: "user1@example.com",
              type: "user",
              image_url: userImageUrls[1],
            },
          ],
          { onConflict: "email" }
        )
        .select("*");

      if (error) throw error;
      adminId = users[0].id;
    } else {
      const admin = existingUsers.find((u) => u.email === "admin@example.com");
      if (!admin) throw new Error("Admin user missing");
      adminId = admin.id;
    }

    /* ---------- PRODUCTS (same data, ≥4 images ensured) ---------- */
    const { data: existingProducts } = await supabase.from("products").select("*");
    const productIds: string[] = [];

    if (!existingProducts?.length) {
      const uploadedImages: string[] = [];
      for (const img of productImages) {
        uploadedImages.push(await uploadToStorage(img, "products"));
      }

      const productsToInsert = Array.from({ length: 9 }).map((_, i) => ({
        user_id: adminId,
        name: `Chocolate Variant ${i + 1}`,
        description: "Premium chocolate made with love",
        price: 200 + i * 25,
        stock: 50,
        product_type: "chocolate",
        sizes: ["small", "large", "largest"],
        image_urls: [
          uploadedImages[i % uploadedImages.length],
          uploadedImages[(i + 1) % uploadedImages.length],
          uploadedImages[(i + 2) % uploadedImages.length],
          uploadedImages[(i + 3) % uploadedImages.length],
        ],
      }));

      const { data: insertedProducts, error } = await supabase
        .from("products")
        .insert(productsToInsert)
        .select("*");

      if (error) throw error;
      productIds.push(...insertedProducts.map((p) => p.id));
    } else {
      productIds.push(...existingProducts.map((p) => p.id));
    }

    /* ---------- COUPONS (UNCHANGED) ---------- */
    const coupons = [
      {
        created_by: adminId,
        coupon_code: "WELCOME10",
        title: "Welcome Offer",
        description: "Get 10% off on all chocolates",
        discount_percent: 10,
        valid_from: "2024-01-01",
        valid_to: "2026-12-31",
        product_id: productIds[0],
        product_type: "chocolate",
      },
      {
        created_by: adminId,
        coupon_code: "FESTIVE25",
        title: "Festive Bonanza",
        description: "Festival season special discount",
        discount_percent: 25,
        valid_from: "2024-10-01",
        valid_to: "2026-11-15",
        product_id: productIds[1],
        product_type: "chocolate",
      },
    ];

    await supabase
      .from("discount_coupons")
      .upsert(coupons, { onConflict: "coupon_code" });

    /* ---------- BLOGS (UNCHANGED) ---------- */
    const { data: existingBlogs } = await supabase.from("blogs").select("*");

    if (!existingBlogs?.length) {
      const blogImageUrls: string[] = [];
      for (const img of blogImages) {
        blogImageUrls.push(await uploadToStorage(img, "blogs"));
      }

      const blogsToInsert = Array.from({ length: 10 }).map((_, i) => ({
        user_id: adminId,
        header: `Chocolate Story ${i + 1}`,
        subheader1: "Sweet Beginnings",
        paragraph1: "Chocolate has been loved for centuries.",
        subheader2: "Modern Delight",
        paragraph2: "Today it symbolizes happiness.",
        image_urls: [blogImageUrls[i % blogImageUrls.length]],
      }));

      await supabase.from("blogs").insert(blogsToInsert);
    }

    /* ---------- OTPs (UNCHANGED) ---------- */
    const { data: existingOtps } = await supabase.from("user_otps").select("*");

    if (!existingOtps?.length) {
      await supabase.from("user_otps").insert([
        {
          user_id: adminId,
          otp: generateOTP(),
        },
        {
          user_id: adminId,
          otp: generateOTP(),
        },
      ]);
    }

    /* ---------- USER ADDRESSES (NEW, ADDITIVE ONLY) ---------- */
    const { data: existingAddresses } = await supabase
      .from("user_addresses")
      .select("*");

    if (!existingAddresses?.length) {
      await supabase.from("user_addresses").insert([
        {
          user_id: adminId,
          full_name: "Admin User",
          phone_number: "9999999999",
          address_line1: "123 Main Street",
          city: "Chandigarh",
          state: "Punjab",
          country: "India",
          postal_code: "160036",
          is_default: true,
        },
        {
          user_id: adminId,
          full_name: "Admin User",
          phone_number: "8888888888",
          address_line1: "Office Address",
          city: "Mohali",
          state: "Punjab",
          country: "India",
          postal_code: "160059",
        },
      ]);
    }

    emitter.emit("log", {
      msg: "✅ Database seeded successfully (original data preserved)",
      level: "info",
    });
  } catch (e) {
    console.error("❌ Seed error:", e);
  }
}



/* ===============================
   EXPORT
================================ */
export { createTables, dropAllTables, seedDatabase };
