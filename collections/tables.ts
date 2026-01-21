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
  const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(fileName);
  if (!publicData?.publicUrl) throw new Error("Public URL generation failed");
  return publicData.publicUrl;
}

/* ===============================
   CREATE TABLES

   ALTER TABLE user_otps
ALTER COLUMN expires_at
TYPE TIMESTAMPTZ
USING expires_at AT TIME ZONE 'UTC';

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
        name text not null,
        email text unique not null,
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

      create index if not exists idx_user_otps_user_id on user_otps(user_id);
      create index if not exists idx_user_otps_otp on user_otps(otp);
      create index if not exists idx_user_otps_expires on user_otps(expires_at);

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

      create table if not exists orders (
        id uuid primary key default gen_random_uuid(),
        created_at timestamp default now(),
        user_id uuid references users(id) on delete cascade,
        status text default 'pending',
        total_amount numeric(10,2),
        product_ids uuid[] default '{}',
        product_count int default 0,
        payment_method_id uuid references payment_methods(id)
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
    `
  });

  if (error) console.error("❌ Error creating tables:", error);
  else emitter.emit("log", { msg: "✅ Tables created successfully", level: "info" });
}


/* ===============================
   DROP ALL TABLES
================================ */
/* ===============================
   DROP ALL TABLES
================================ */
async function dropAllTables() {
  const { error } = await supabase.rpc("exec_sql", {
    sql: `
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
    `
  });

  if (error) console.error("❌ Error dropping database objects:", error);
  else emitter.emit("log", { msg: "🧹 Database fully reset", level: "info" });
}

/* ===============================
   SEED DATABASE
================================ */
async function seedDatabase() {
  try {
    // ---------- USERS ----------
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
      if (!users || !users.length) throw new Error("Failed to insert users");

      adminId = users[0].id;
    } else {
      const admin = existingUsers.find((u) => u.email === "admin@example.com");
      if (!admin) throw new Error("Admin user missing");
      adminId = admin.id;
    }

    // ---------- PRODUCTS ----------
    const { data: existingProducts } = await supabase.from("products").select("*");
    const productIds: string[] = [];

    if (!existingProducts?.length) {
      const productImageUrls: string[][] = [];

      for (let i = 0; i < productImages.length; i += 3) {
        const group: string[] = [];
        for (let j = i; j < i + 3 && productImages[j]; j++) {
          group.push(await uploadToStorage(productImages[j]!, "products"));
        }
        productImageUrls.push(group);
      }

      const productsToInsert = Array.from({ length: 9 }).map((_, i) => ({
        user_id: adminId,
        name: `Chocolate Variant ${i + 1}`,
        description: "Premium chocolate made with love",
        price: 200 + i * 25,
        stock: 50,
        product_type: "chocolate",
        sizes: ["small", "large", "largest"],
        image_urls: productImageUrls[i % productImageUrls.length] || [],
      }));

      const { data: insertedProducts, error } = await supabase
        .from("products")
        .insert(productsToInsert)
        .select("*");

      if (error) throw error;

      productIds.push(...(insertedProducts?.map((p) => p.id) ?? []));
    } else {
      productIds.push(...existingProducts.map((p) => p.id));
    }

    // ---------- COUPONS ----------
    const newCoupons = [
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
      {
        created_by: adminId,
        coupon_code: "NEWYEAR50",
        title: "New Year Special",
        description: "50% off for the New Year",
        discount_percent: 50,
        valid_from: "2025-12-01",
        valid_to: "2026-01-10",
        product_id: productIds[2],
        product_type: "chocolate",
      },
      {
        created_by: adminId,
        coupon_code: "SUMMER15",
        title: "Summer Discount",
        description: "15% off to beat the heat",
        discount_percent: 15,
        valid_from: "2026-01-01",
        valid_to: "2026-06-30",
        product_id: productIds[3],
        product_type: "chocolate",
      },
      {
        created_by: adminId,
        coupon_code: "BIRTHDAY20",
        title: "Birthday Surprise",
        description: "Celebrate with 20% off",
        discount_percent: 20,
        valid_from: "2026-01-01",
        valid_to: "2026-12-31",
        product_id: productIds[4],
        product_type: "chocolate",
      },
      {
        created_by: adminId,
        coupon_code: "LOYALTY30",
        title: "Loyalty Reward",
        description: "30% discount for our loyal customers",
        discount_percent: 30,
        valid_from: "2026-01-01",
        valid_to: "2026-12-31",
        product_id: productIds[5],
        product_type: "chocolate",
      },
    ];

    const { error: couponError } = await supabase
      .from("discount_coupons")
      .upsert(newCoupons, { onConflict: "coupon_code" });

    if (couponError) throw couponError;

    // ---------- BLOGS ----------
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

      const { error } = await supabase.from("blogs").insert(blogsToInsert);
      if (error) throw error;
    }

    // ---------- OTPs ----------
    const { data: existingOtps } = await supabase.from("user_otps").select("*");

    if (!existingOtps?.length) {
      const { error } = await supabase.from("user_otps").insert([
        {
          user_id: adminId,
          otp: generateOTP(),
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        },
        {
          user_id: adminId,
          otp: generateOTP(),
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        },
      ]);

      if (error) throw error;
    }

    emitter.emit("log", {
      msg: "✅ Database seeded successfully (users, products, coupons, blogs, otps)",
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
