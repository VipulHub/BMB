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
// Flattened products array
const products = [
  {
    name: 'Pure Peanut Butter Powder',
    description: '54g Protein, Unsweetened, Unsalted, 100% Natural, 1/3 Calories, 4x Less Fat, Ideal for Smoothies, Spreads, Baking & Fitness Diets, Double in weight when prepared, Just add water to make creamy peanut butter spread or use directly as powder in roti, shakes, baking and many more.',
    img: [
      path.join(__dirname, "../public/images/pure1.png"),
      path.join(__dirname, "../public/images/pure2.png"),
      path.join(__dirname, "../public/images/pure3.png"),
      path.join(__dirname, "../public/images/pure4.png"),
      path.join(__dirname, "../public/images/pure5.png"),
    ],
    size: ['410gm', '227gm'],
    size_prices: { "410gm": 710, "227gm": 459 },
    discounted_prices: { "410gm": 525, "227gm": 339 },
    stock: 50
  },
  {
    name: 'Original Peanut Butter Powder',
    description: '46g Protein, Classic American Taste, No Preservatives, 1/3 the Calories, 4x Less Fat, Spread, Blend, Mix or Bake, Perfect for Every Protein Fix, Double in weight when prepared, Just add water to make creamy peanut butter spread or use directly as powder in shakes, baking and many more.',
    img: [
      path.join(__dirname, "../public/images/original1.png"),
      path.join(__dirname, "../public/images/original2.png"),
      path.join(__dirname, "../public/images/original3.png"),
      path.join(__dirname, "../public/images/original4.png"),
      path.join(__dirname, "../public/images/original5.png"),
    ],
    size: ['410gm', '227gm'],
    size_prices: { "410gm": 710, "227gm": 459 },
    discounted_prices: { "410gm": 525, "227gm": 339 },
    stock: 50
  },
  {
    name: 'Chocolate Peanut Butter Powder',
    description: '37g Protein, With Real Cocoa, Guilt-Free Indulgence, 1/3 Calories, 4x Less Fat, Rich Chocolate Taste for Everyday Snacking & Healthy Lifestyles, Double in weight when prepared, Just add water to make creamy peanut butter spread or use directly as powder in shakes, baking and many more.',
    img: [
      path.join(__dirname, "../public/images/chocolate1.png"),
      path.join(__dirname, "../public/images/chocolate2.png"),
      path.join(__dirname, "../public/images/chocolate3.png"),
      path.join(__dirname, "../public/images/chocolate4.png"),
      path.join(__dirname, "../public/images/chocolate5.png"),
    ],
    size: ['410gm', '227gm'],
    size_prices: { "410gm": 710, "227gm": 459 },
    discounted_prices: { "410gm": 525, "227gm": 339 },
    stock: 50
  },
  {
    name: 'Peanut Butter Family Pack',
    description: 'Peanut Butter Powder Family Pack, Original, Chocolate & Pure Peanut Butter Powder, 562g Total Protein Per Combo | No Preservatives | 1/3 the Calories | 4x Less Fat, Spread, Blend, Mix or Bake, Perfect for Every Protein Fix, Double in weight when prepared, Just add water to make creamy peanut butter spread or use directly as powder in roti, shakes, baking and many more.',
    img: [
      path.join(__dirname, "../public/images/chocolate1.png"),
      path.join(__dirname, "../public/images/chocolate2.png"),
      path.join(__dirname, "../public/images/chocolate3.png"),
    ],
    size: ['410gm', '227gm'],
    size_prices: { "410gm": 2130, "227gm": 1377  },
    discounted_prices: { "410gm": 1576, "227gm": 999 },
    stock: 50
  },
  {
    name: 'Pure & Chocolate Combo 373g',
    description: 'Peanut Butter Powder Combo Pack, Pure & Chocolate Peanut Butter Powder, 373g Total Protein Per Combo | No Preservatives | 1/3 the Calories | 4x Less Fat, Spread, Blend, Mix or Bake, Perfect for Every Protein Fix, Double in weight when prepared, Just add water to make creamy peanut butter spread or use directly as powder in roti, shakes, baking and many more.',
    img: [
      path.join(__dirname, "../public/images/chocolate1.png"),
      path.join(__dirname, "../public/images/chocolate2.png"),
      path.join(__dirname, "../public/images/chocolate3.png"),
    ],
    size: ['410gm', '227gm'],
    size_prices: { "410gm": 1420 , "227gm": 918  },
    discounted_prices: { "410gm": 1020, "227gm": 680 },
    stock: 50
  },
  {
    name: 'Pure & Chocolate Combo 410g',
    description: 'Peanut Butter Powder Combo Pack, Pure & Chocolate Peanut Butter Powder, 410g Total Protein Per Combo | No Preservatives | 1/3 the Calories | 4x Less Fat, Spread, Blend, Mix or Bake, Perfect for Every Protein Fix, Double in weight when prepared, Just add water to make creamy peanut butter spread or use directly as powder in roti, shakes, baking and many more.',
    img: [
      path.join(__dirname, "../public/images/chocolate1.png"),
      path.join(__dirname, "../public/images/chocolate2.png"),
      path.join(__dirname, "../public/images/chocolate3.png"),
    ],
    size: ['410gm', '227gm'],
  size_prices: { "410gm": 1420 , "227gm": 918  },
    discounted_prices: { "410gm": 1020, "227gm": 680 },
    stock: 50
  },
  {
    name: 'Chocolate & Original Combo 340g',
    description: 'Peanut Butter Powder Combo Pack, Chocolate & Original Peanut Butter Powder, 340g Total Protein Per Combo No Preservatives, 1/3 the Calories, 4x Less Fat, Spread, Blend, Mix or Bake, Perfect for Every Protein Fix, Double in weight when prepared, Just add water to make creamy peanut butter spread or use directly as powder in shakes, baking and many more.',
    img: [
      path.join(__dirname, "../public/images/chocolate1.png"),
      path.join(__dirname, "../public/images/chocolate2.png"),
      path.join(__dirname, "../public/images/chocolate3.png"),
    ],
    size: ['410gm', '227gm'],
   size_prices: { "410gm": 1420 , "227gm": 918  },
    discounted_prices: { "410gm": 1020, "227gm": 680 },
    stock: 50
  },
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
      /* ---------- ENUMS ---------- */
      do $$ begin
        if not exists (select 1 from pg_type where typname = 'user_role') then
          create type user_role as enum ('user', 'admin');
        end if;

        if not exists (select 1 from pg_type where typname = 'product_size') then
          create type product_size as enum ('small', 'large', 'largest');
        end if;
      end $$;

      /* ---------- EXTENSIONS ---------- */
      create extension if not exists "pgcrypto";

      /* ---------- API LOGS ---------- */
      create table if not exists api_log (
        id uuid primary key default gen_random_uuid(),
        created_at timestamptz default now(),
        endpoint text,
        method text,
        status_code int,
        response_time numeric,
        ip_address text,
        upload_at timestamptz
      );

      /* ---------- APPLICATION ERRORS ---------- */
      create table if not exists app_errors (
        id uuid primary key default gen_random_uuid(),
        created_at timestamptz default now(),
        error_message text,
        stack_trace text,
        method_name text,
        level text
      );

    /* ---------- USERS ---------- */
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  name text,
  email text unique,
  type user_role not null default 'user',
  phone_number text,
  address text,
  image_url text,
  session_id text unique         -- 👈 NEW: store session id
);

      /* ---------- USER OTPs ---------- */
      create table if not exists user_otps (
        id uuid primary key default gen_random_uuid(),
        user_id uuid references users(id) on delete cascade,
        otp text not null,
        created_at timestamptz default now(),
        expires_at timestamptz default (now() + interval '5 minutes')
      );

      create index if not exists idx_user_otps_user_id on user_otps(user_id);

      /* ---------- PRODUCTS ---------- */
   CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    user_id UUID NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    stock INT DEFAULT 0,
    product_type TEXT,
    sizes TEXT[],                -- array of available sizes
    size_prices JSONB,           -- map of size -> price
    discounted_prices JSONB,     -- map of size -> discounted price
    image_urls TEXT[],           -- array of image URLs
    priority INT DEFAULT 0       -- new column to set display priority
);
      create index if not exists idx_products_user_id on products(user_id);

      /* ---------- WISHLIST ---------- */
      create table if not exists wishlist (
        id uuid primary key default gen_random_uuid(),
        user_id uuid references users(id) on delete cascade,
        product_ids uuid[] default '{}',
        created_at timestamptz default now()
      );

      create index if not exists idx_wishlist_user_id on wishlist(user_id);

  /* ---------- CARTS ---------- */
create table if not exists carts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  user_id uuid unique references users(id) on delete cascade,
  session_id text unique,
  items jsonb default '[]'::jsonb,
  product_count int default 0,
  total_price numeric(10,2) default 0,
  constraint cart_owner_check check (
    user_id is not null or session_id is not null
  )
);


      /* ---------- PAYMENT METHODS ---------- */
      create table if not exists payment_methods (
        id uuid primary key default gen_random_uuid(),
        created_at timestamptz default now(),
        user_id uuid references users(id) on delete cascade,
        card_number text,
        expiry_date text,
        cardholder_name text,
        brand text
      );

      create index if not exists idx_payment_methods_user_id on payment_methods(user_id);

      /* ---------- ORDERS ---------- */
      create table if not exists orders (
        id uuid primary key default gen_random_uuid(),
        created_at timestamptz default now(),
        updated_at timestamptz default now(),
        user_id uuid references users(id) on delete cascade,
        status text default 'pending',
        total_amount numeric(10,2),
        product_ids uuid[] default '{}',
        product_count int default 0,
        payment_method_id uuid references payment_methods(id),
        razorpay_order_id text,
        razorpay_payment_id text
      );

      create index if not exists idx_orders_user_id on orders(user_id);
      create index if not exists idx_orders_razorpay_order_id on orders(razorpay_order_id);

      /* ---------- ORDER PAYMENT HISTORY ---------- */
      create table if not exists order_payment_history (
        id uuid primary key default gen_random_uuid(),
        order_id uuid references orders(id) on delete cascade,
        created_at timestamptz default now(),
        amount numeric(10,2),
        method_used text,
        status text
      );

      create index if not exists idx_payment_history_order_id on order_payment_history(order_id);

      /* ---------- DISCOUNT COUPONS ---------- */
      create table if not exists discount_coupons (
        id uuid primary key default gen_random_uuid(),
        created_at timestamptz default now(),
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

      /* ---------- SHIPPING (DELHIVERY) ---------- */
      create table if not exists shipping_details (
        id uuid primary key default gen_random_uuid(),
        order_id uuid references orders(id) on delete cascade,
        waybill text unique,
        delhivery_order_id text,
        consignee_name text,
        phone text,
        address text,
        pin text,
        country text,
        payment_mode text check (payment_mode in ('Prepaid', 'COD')),
        total_amount numeric(10,2),
        cod_amount numeric(10,2) default 0,
        shipping_mode text default 'Surface',
        weight numeric default 0.5,
        quantity int default 1,
        product_description text,
        current_status text,
        current_location text,
        expected_delivery date,
        last_scan_at timestamptz,
        delhivery_status_code text,
        delhivery_response jsonb,
        created_at timestamptz default now(),
        updated_at timestamptz default now()
      );

      create index if not exists idx_shipping_order_id on shipping_details(order_id);
      create index if not exists idx_shipping_waybill on shipping_details(waybill);

      /* ---------- BLOGS ---------- */
      create table if not exists blogs (
        id uuid primary key default gen_random_uuid(),
        user_id uuid references users(id) on delete cascade,
        created_at timestamptz default now(),
        header text not null,
        subheader1 text,
        paragraph1 text,
        subheader2 text,
        paragraph2 text,
        image_urls text[] default '{}'
      );

      /* ---------- USER ADDRESSES ---------- */
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
        created_at timestamptz default now()
      );

      create index if not exists idx_user_addresses_user_id on user_addresses(user_id);
    `,
  });

  if (error) {
    console.error("❌ Error creating tables:", error);
  } else {
    emitter.emit("log", {
      msg: "✅ Tables created successfully (fully aligned & backward-compatible)",
      level: "info",
    });
  }
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
   SEED DATABASE (ALL TABLES)
================================ */
async function seedDatabase() {
  try {
    // --- CREATE ADMIN USER ---
    let adminId: string;
    const { data: existingAdmin } = await supabase
      .from("users")
      .select("id")
      .eq("email", "admin@example.com");

    if (existingAdmin && existingAdmin.length > 0) {
      adminId = existingAdmin[0]!.id;
    } else {
      const { data: adminData } = await supabase
        .from("users")
        .insert({ name: "Admin", email: "admin@example.com", type: "admin" })
        .select();
      adminId = adminData![0].id;
    }

    // --- INSERT PRODUCTS ---
    for (const product of products) {
      const imageUrls: string[] = [];
      for (const img of product.img) {
        imageUrls.push(await uploadToStorage(img, "products"));
      }

      await supabase.from("products").insert({
        user_id: adminId,
        name: product.name,
        description: product.description,
        stock: product.stock,
        product_type: "peanut_butter",
        sizes: product.size,
        size_prices: product.size_prices,
        discounted_prices: product.discounted_prices,
        image_urls: imageUrls,
      });
    }

    // --- INSERT BLOGS ---
    for (let i = 0; i < blogImages.length; i++) {
      await supabase.from("blogs").insert({
        user_id: adminId,
        header: `Blog Header ${i + 1}`,
        paragraph1: `This is blog content for blog ${i + 1}`,
        image_urls: [await uploadToStorage(blogImages[i]!, "blogs")],
      });
    }

    // --- INSERT USERS ---
    for (let i = 0; i < userImages.length; i++) {
      const email = `user${i + 1}@example.com`;
      const { data: existingUser } = await supabase
        .from("users")
        .select("id")
        .eq("email", email);
      if (existingUser && existingUser.length > 0) continue;

      await supabase.from("users").insert({
        name: `User ${i + 1}`,
        email,
        type: "user",
        image_url: await uploadToStorage(userImages[i]!, "users"),
      });
    }

    // --- INSERT OTP FOR ADMIN ---
    await supabase.from("user_otps").insert({
      user_id: adminId,
      otp: generateOTP(),
    });

    // --- ADMIN ADDRESS ---
    await supabase.from("user_addresses").insert({
      user_id: adminId,
      full_name: "Admin User",
      phone_number: "9999999999",
      address_line1: "Connaught Place",
      city: "Delhi",
      state: "Delhi",
      country: "India",
      postal_code: "110001",
      is_default: true,
    });

    emitter.emit("log", {
      msg: "✅ Database seeded successfully: admin, all products, blogs, users, OTPs, addresses",
      level: "info",
    });

  } catch (err) {
    console.error("❌ Seed error:", err);
  }
}


/* ===============================
   EXPORT
================================ */
export { createTables, dropAllTables, seedDatabase };

