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
      path.join(__dirname, "../public/images/O1.png"),
      path.join(__dirname, "../public/images/pure2.png"),
      path.join(__dirname, "../public/images/pure3.png"),
      path.join(__dirname, "../public/images/pure4.png"),
      path.join(__dirname, "../public/images/pure5.png"),
    ],
    size: ['410gm', '227gm'],
    size_prices: { "410gm": 710, "227gm": 459 },
    discounted_prices: { "410gm": 525, "227gm": 339 },
    stock: 50,
    priority: 2
  },
  {
    name: 'Original Peanut Butter Powder',
    description: '46g Protein, Classic American Taste, No Preservatives, 1/3 the Calories, 4x Less Fat, Spread, Blend, Mix or Bake, Perfect for Every Protein Fix, Double in weight when prepared, Just add water to make creamy peanut butter spread or use directly as powder in shakes, baking and many more.',
    img: [
      path.join(__dirname, "../public/images/P1.png"),
      path.join(__dirname, "../public/images/original2.png"),
      path.join(__dirname, "../public/images/original3.png"),
      path.join(__dirname, "../public/images/original4.png"),
      path.join(__dirname, "../public/images/original5.png"),
    ],
    size: ['410gm', '227gm'],
    size_prices: { "410gm": 710, "227gm": 459 },
    discounted_prices: { "410gm": 525, "227gm": 339 },
    stock: 50,
    priority: 4
  },
  {
    name: 'Chocolate Peanut Butter Powder',
    description: '37g Protein, With Real Cocoa, Guilt-Free Indulgence, 1/3 Calories, 4x Less Fat, Rich Chocolate Taste for Everyday Snacking & Healthy Lifestyles, Double in weight when prepared, Just add water to make creamy peanut butter spread or use directly as powder in shakes, baking and many more.',
    img: [
      path.join(__dirname, "../public/images/C1.png"),
      path.join(__dirname, "../public/images/chocolate2.png"),
      path.join(__dirname, "../public/images/chocolate3.png"),
      path.join(__dirname, "../public/images/chocolate4.png"),
      path.join(__dirname, "../public/images/chocolate5.png"),
    ],
    size: ['410gm', '227gm'],
    size_prices: { "410gm": 710, "227gm": 459 },
    discounted_prices: { "410gm": 525, "227gm": 339 },
    stock: 50,
    priority: 3
  },
  {
    name: 'Peanut Butter Family Pack',
    description: 'Peanut Butter Powder Family Pack, Original, Chocolate & Pure Peanut Butter Powder, 562g Total Protein Per Combo | No Preservatives | 1/3 the Calories | 4x Less Fat, Spread, Blend, Mix or Bake, Perfect for Every Protein Fix, Double in weight when prepared, Just add water to make creamy peanut butter spread or use directly as powder in roti, shakes, baking and many more.',
    img: [
      path.join(__dirname, "../public/images/3 combo.jpg.jpeg"),
      path.join(__dirname, "../public/images/chocolate2.png"),
      path.join(__dirname, "../public/images/chocolate3.png"),
    ],
    size: ['410gm', '227gm'],
    size_prices: { "410gm": 2130, "227gm": 1377 },
    discounted_prices: { "410gm": 1576, "227gm": 999 },
    stock: 50,
    priority: 1
  },
  {
    name: 'Pure & Original Combo',
    description: 'Peanut Butter Powder Combo Pack, Pure & Chocolate Peanut Butter Powder, 410g Total Protein Per Combo | No Preservatives | 1/3 the Calories | 4x Less Fat, Spread, Blend, Mix or Bake, Perfect for Every Protein Fix, Double in weight when prepared, Just add water to make creamy peanut butter spread or use directly as powder in roti, shakes, baking and many more.',
    img: [
      path.join(__dirname, "../public/images/pure orig combo.jpg.jpeg"),
      path.join(__dirname, "../public/images/chocolate2.png"),
      path.join(__dirname, "../public/images/chocolate3.png"),
    ],
    size: ['410gm', '227gm'],
    size_prices: { "410gm": 1420, "227gm": 918 },
    discounted_prices: { "410gm": 1020, "227gm": 680 },
    stock: 50,
    priority: 5
  },
  {
    name: 'Pure & Chocolate Combo',
    description: 'Peanut Butter Powder Combo Pack, Pure & Chocolate Peanut Butter Powder, 410g Total Protein Per Combo | No Preservatives | 1/3 the Calories | 4x Less Fat, Spread, Blend, Mix or Bake, Perfect for Every Protein Fix, Double in weight when prepared, Just add water to make creamy peanut butter spread or use directly as powder in roti, shakes, baking and many more.',
    img: [
      path.join(__dirname, "../public/images/p and c.png"),
      path.join(__dirname, "../public/images/chocolate2.png"),
      path.join(__dirname, "../public/images/chocolate3.png"),
    ],
    size: ['410gm', '227gm'],
    size_prices: { "410gm": 1420, "227gm": 918 },
    discounted_prices: { "410gm": 1020, "227gm": 680 },
    stock: 50,
    priority: 6
  },
  {
    name: 'Chocolate & Original Combo',
    description: 'Peanut Butter Powder Combo Pack, Chocolate & Original Peanut Butter Powder, 340g Total Protein Per Combo No Preservatives, 1/3 the Calories, 4x Less Fat, Spread, Blend, Mix or Bake, Perfect for Every Protein Fix, Double in weight when prepared, Just add water to make creamy peanut butter spread or use directly as powder in shakes, baking and many more.',
    img: [
      path.join(__dirname, "../public/images/orig choc combo.jpg.jpeg"),
      path.join(__dirname, "../public/images/chocolate2.png"),
      path.join(__dirname, "../public/images/chocolate3.png"),
    ],
    size: ['410gm', '227gm'],
    size_prices: { "410gm": 1420, "227gm": 918 },
    discounted_prices: { "410gm": 1020, "227gm": 680 },
    stock: 50,
    priority: 7
  },
];



const blogImages = [
  path.join(__dirname, "../public/images/recipeOne.png"),
  path.join(__dirname, "../public/images/recipeTwo.png"),
  path.join(__dirname, "../public/images/recipeThree.png"),
  path.join(__dirname, "../public/images/recipeFour.png"),
  path.join(__dirname, "../public/images/recipeFive.png"),
  path.join(__dirname, "../public/images/recipeSix.jpeg"),
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
   CREATE TABLES (SAFE & IDEMPOTENT)
   ✅ Includes FULL ORDERS fix:
      - orders.order_id TEXT UNIQUE (stores YYYYMMDDXXXXX)
      - safe ALTER for existing orders table
      - indexes
================================ */

async function createTables() {
  const { error } = await supabase.rpc("exec_sql", {
    sql: `
/* =====================================================
   ENUMS (SAFE)
===================================================== */
do $$ begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type user_role as enum ('user', 'admin');
  end if;

  if not exists (select 1 from pg_type where typname = 'product_size') then
    create type product_size as enum ('small', 'large', 'largest');
  end if;
end $$;

/* =====================================================
   EXTENSIONS
===================================================== */
create extension if not exists "pgcrypto";

/* =====================================================
   API LOGS
===================================================== */
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

/* =====================================================
   FAILED JOBS / RETRY QUEUE
===================================================== */
create table if not exists failed_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  job_type text not null,
  function_name text not null,

  payload jsonb not null,
  context jsonb default '{}'::jsonb,

  last_error text,
  last_error_stack text,
  last_status_code int,
  last_response jsonb,

  attempts int not null default 0,
  max_attempts int not null default 10,
  next_retry_at timestamptz default now(),
  locked_at timestamptz,
  locked_by text,

  status text not null default 'pending'
    check (status in ('pending','processing','succeeded','dead')),

  dedupe_key text unique
);

create index if not exists idx_failed_jobs_status_next_retry
  on failed_jobs(status, next_retry_at);
create index if not exists idx_failed_jobs_job_type
  on failed_jobs(job_type);
create index if not exists idx_failed_jobs_locked_at
  on failed_jobs(locked_at);

/* =====================================================
   APPLICATION ERRORS
===================================================== */
create table if not exists app_errors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  error_message text,
  stack_trace text,
  method_name text,
  level text
);

/* =====================================================
   USERS
===================================================== */
create table if not exists users (
  id uuid primary key default gen_random_uuid(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  name text,
  email text unique,
  type user_role not null default 'user',

  phone_number text,
  address text,
  image_url text,

  session_id text unique,

  jwt_token text,
  jwt_expires_at timestamptz
);

/* =====================================================
   USER OTPS
===================================================== */
create table if not exists user_otps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  otp text not null,
  created_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '5 minutes')
);

create index if not exists idx_user_otps_user_id on user_otps(user_id);

/* =====================================================
   PRODUCTS (FIXED)
===================================================== */
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  user_id uuid not null,
  name text not null,
  description text,
  stock int default 0,
  product_type text,
  sizes text[],
  size_prices jsonb,
  discounted_prices jsonb,
  image_urls text[],
  priority int default 0
);

create index if not exists idx_products_user_id on products(user_id);

/* ---- SAFE MIGRATION FOR EXISTING PRODUCTS TABLE ---- */
do $$ begin
  if exists (select 1 from information_schema.tables where table_name='products') then
    alter table products
      add column if not exists created_at timestamptz default now(),
      add column if not exists user_id uuid,
      add column if not exists description text,
      add column if not exists stock int default 0,
      add column if not exists product_type text,
      add column if not exists sizes text[],
      add column if not exists size_prices jsonb,
      add column if not exists discounted_prices jsonb,
      add column if not exists image_urls text[],
      add column if not exists priority int default 0;
  end if;
end $$;

/* =====================================================
   WISHLIST
===================================================== */
create table if not exists wishlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  product_ids uuid[] default '{}',
  created_at timestamptz default now()
);

create index if not exists idx_wishlist_user_id on wishlist(user_id);

/* =====================================================
   CARTS
===================================================== */
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

/* =====================================================
   PRODUCT OFFERS
===================================================== */
create table if not exists product_offers (
  id uuid primary key default gen_random_uuid(),

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  product_id uuid not null
    references products(id)
    on delete cascade,

  discount_percent numeric(5,2) not null
    check (discount_percent >= 0 and discount_percent <= 100),

  min_quantity int not null
    check (min_quantity >= 1),

  is_active boolean not null default true,

  constraint uq_product_offer_product_qty
    unique (product_id, min_quantity)
);

create index if not exists idx_product_offers_product_id
  on product_offers(product_id);

create index if not exists idx_product_offers_product_qty
  on product_offers(product_id, min_quantity);

/* =====================================================
   CART ITEMS (NEW)
===================================================== */
create table if not exists cart_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  cart_id uuid not null references carts(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,

  offer_id uuid references product_offers(id) on delete set null,

  quantity int not null default 1 check (quantity >= 1),
  selected_size text,
  unit_price numeric(10,2),
  discounted_unit_price numeric(10,2),
  line_total numeric(10,2),
  meta jsonb default '{}'::jsonb
);

create index if not exists idx_cart_items_cart_id on cart_items(cart_id);
create index if not exists idx_cart_items_product_id on cart_items(product_id);
create index if not exists idx_cart_items_offer_id on cart_items(offer_id);

do $$ begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'uq_cart_items_cart_product_size_offer'
  ) then
    execute 'create unique index uq_cart_items_cart_product_size_offer
             on cart_items(cart_id, product_id, coalesce(selected_size, ''''), coalesce(offer_id::text, ''''))';
  end if;
end $$;

/* =====================================================
   AUTO UPDATE updated_at (PRODUCT OFFERS + CART ITEMS)
===================================================== */
create or replace function set_updated_at_generic()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_updated_at_product_offers on product_offers;
create trigger trg_set_updated_at_product_offers
before update on product_offers
for each row execute function set_updated_at_generic();

drop trigger if exists trg_set_updated_at_cart_items on cart_items;
create trigger trg_set_updated_at_cart_items
before update on cart_items
for each row execute function set_updated_at_generic();

/* =====================================================
   PAYMENT METHODS
===================================================== */
create table if not exists payment_methods (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  user_id uuid references users(id) on delete cascade,
  card_number text,
  expiry_date text,
  cardholder_name text,
  brand text
);

create index if not exists idx_payment_methods_user_id
  on payment_methods(user_id);

/* =====================================================
   ✅ ORDERS (UPDATED)
   - id: internal uuid
   - order_id: public TEXT (YYYYMMDDXXXXX)
===================================================== */
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),

  -- ✅ PUBLIC ORDER ID (YYYYMMDDXXXXX)
  order_id text unique,

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
create index if not exists idx_orders_order_id on orders(order_id);
create index if not exists idx_orders_razorpay_order_id on orders(razorpay_order_id);

/* ---- ✅ SAFE MIGRATION FOR EXISTING ORDERS TABLE ---- */
do $$ begin
  if exists (select 1 from information_schema.tables where table_name='orders') then
    alter table orders
      add column if not exists order_id text,
      add column if not exists created_at timestamptz default now(),
      add column if not exists updated_at timestamptz default now(),
      add column if not exists razorpay_order_id text,
      add column if not exists razorpay_payment_id text,
      add column if not exists status text default 'pending',
      add column if not exists total_amount numeric(10,2),
      add column if not exists product_ids uuid[] default '{}',
      add column if not exists product_count int default 0,
      add column if not exists payment_method_id uuid;

    if not exists (
      select 1 from pg_constraint
      where conname = 'uq_orders_order_id'
    ) then
      alter table orders add constraint uq_orders_order_id unique (order_id);
    end if;

    create index if not exists idx_orders_order_id on orders(order_id);
  end if;
end $$;

/* =====================================================
   ORDER PAYMENT HISTORY
===================================================== */
create table if not exists order_payment_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  created_at timestamptz default now(),
  amount numeric(10,2),
  method_used text,
  status text
);

create index if not exists idx_payment_history_order_id
  on order_payment_history(order_id);

/* =====================================================
   DISCOUNT COUPONS
===================================================== */
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

/* =====================================================
   SHIPPING (DELHIVERY)
===================================================== */
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

  -- ✅ NEW: store all order items here (your 4 items)
  shipment_items jsonb default '[]'::jsonb,

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

-- ✅ SAFE MIGRATION FOR EXISTING TABLE
do $$ begin
  if exists (select 1 from information_schema.tables where table_name='shipping_details') then
    alter table shipping_details
      add column if not exists shipment_items jsonb default '[]'::jsonb;
  end if;
end $$;

/* =====================================================
   BLOGS
===================================================== */
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

/* =====================================================
   USER ADDRESSES
===================================================== */
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

create index if not exists idx_user_addresses_user_id
  on user_addresses(user_id);

/* =====================================================
   LEADS
===================================================== */
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),

  phone_number text,
  email text,
  session_id text not null,

  constraint leads_email_or_phone_chk
    check (email is not null or phone_number is not null)
);

drop index if exists idx_leads_email;
drop index if exists idx_leads_phone_number;
create index if not exists idx_leads_session_id on leads(session_id);
create index if not exists idx_leads_email on leads(email) where email is not null;
create index if not exists idx_leads_phone_number on leads(phone_number) where phone_number is not null;
`,
  });

  if (error) {
    console.error("❌ Error creating tables:", error);
  } else {
    emitter.emit("log", {
      msg: "✅ Tables created / migrated successfully",
      level: "info",
    });
  }
}

/* ===============================
   DROP ALL TABLES (UPDATED)
================================ */
async function dropAllTables() {
  const { error } = await supabase.rpc("exec_sql", {
    sql: `
      /* ---- DROP TABLES (child -> parent) ---- */
      drop table if exists product_offers cascade;

      drop table if exists shipping_details cascade;
      drop table if exists order_payment_history cascade;
      drop table if exists orders cascade;

      drop table if exists payment_methods cascade;
      drop table if exists carts cascade;
      drop table if exists wishlist cascade;

      drop table if exists discount_coupons cascade;

      drop table if exists user_otps cascade;
      drop table if exists user_addresses cascade;

      drop table if exists leads cascade;
      drop table if exists blogs cascade;

      drop table if exists failed_jobs cascade;
      drop table if exists app_errors cascade;
      drop table if exists api_log cascade;

      drop table if exists products cascade;
      drop table if exists users cascade;

      /* ---- DROP FUNCTIONS/TRIGGERS (safe) ---- */
      drop trigger if exists trg_set_updated_at_product_offers on product_offers;
      drop function if exists set_updated_at_product_offers();

      /* ---- DROP TYPES ---- */
      drop type if exists user_role cascade;
      drop type if exists product_size cascade;

      /* ---- DROP EXTENSIONS ---- */
      drop extension if exists "pgcrypto";
    `,
  });

  if (error) console.error("❌ Error dropping database objects:", error);
  else emitter.emit("log", { msg: "🧹 Database fully reset", level: "info" });
}



// ✅ UPDATED seedDatabase() (BLOGS NOW SEEDED WITH YOUR REAL JSON + SAME LOCAL IMAGES)
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
        priority: product.priority,
      });
    }

    // ✅ UPDATED BLOG SEED (USES YOUR NEW BLOG JSON CONTENT)
    // ✅ IMAGES STAY AS YOUR ORIGINAL LOCAL BLOG IMAGES (recipeOne..Four)
    const blogsSeed = [
      {
        header: "Protein Dosa (South Indian Twist)",
        subheader1: "Ingredients (2 dosas):-",
        paragraph1:
          "- Rice flour – 60 g\r\n\r\n- Urad dal flour – 20 g\r\n\r\n- PB powder Pure – 20 g\r\n\r\n- Salt + water",
        subheader2: "Method:-",
        paragraph2:
          "Mix batter, rest 15 min, spread thin on tawa, cook crisp.\r\n\r\n🧮 Nutrition Per 1 Dosa\r\nNutrient\t              Amount\r\nCalories\t           ~150 kcal\r\nProtein\t              9 g\r\nCarbs\t              22 g\r\nFat\t                      2 g\r\n\r\nDisclaimer\r\n\r\nNutritional values are approximate and may vary depending on ingredients and cooking method.",
        img: blogImages[0], // recipeOne.png
      },
      {
        header: "Protein Samosa",
        subheader1: "Filling Ingredients (4 samosas):-",
        paragraph1:
          "- Boiled potatoes – 200 g\r\n\r\n- Green peas – 50 g\r\n\r\n- Original PB powder – 40 g\r\n\r\n- Spices & salt",
        subheader2: "Dough:-\r\n",
        paragraph2:
          "- Maida – 150 g\r\n\r\n- Oil – 1 tbsp\r\n\r\n- Water\r\n\r\n🧑‍🍳 Method:- \r\n\r\nMix PB powder into aloo filling → stuff samosa → bake/air-fry.\r\n\r\n🧮 Nutrition Per 1 Samosa (Air-Fried)\r\nNutrient\t             Amount\r\nCalories\t             ~180 kcal\r\nProtein\t             6 g\r\nCarbs\t            25 g\r\nFat\t                    6 g\r\n\r\nDisclaimer\r\n\r\nNutritional values are approximate and may vary depending on ingredients and cooking method.\r\n",
        img: blogImages[1], // recipeTwo.png
      },
      {
        header: "Chocolate Protein Ladu",
        subheader1: "Ingredients (8 laddoos):-\r\n",
        paragraph1:
          "- Chocolate PB powder – 100 g\r\n\r\n- Dates paste – 60 g\r\n\r\n- Milk – 3 tbsp\r\n\r\n- Nuts – optional",
        subheader2: "Method:-",
        paragraph2:
          "Mix → roll into laddoos → refrigerate 30 min.\r\n\r\n🧮 Nutrition Per 1 Laddoo\r\nNutrient\t           Amount\r\nCalories           \t~110 kcal\r\nProtein\t            4.5 g\r\nCarbs               \t12 g\r\nFat\t                    3 g\r\n\r\nDisclaimer\r\n\r\nNutritional values are approximate and may vary depending on ingredients and cooking method.",
        img: blogImages[2], // recipeThree.png
      },
      {
        header: "High-Protein Peanut Butter Powder Roti",
        subheader1: "Ingredients (2 rotis):-\r\n",
        paragraph1:
          "- Wheat flour – 100 g\r\n\r\n- Unsweetened PB powder – 20 g\r\n\r\n- Salt – pinch\r\n\r\n- Water – as needed",
        subheader2: "Method:-",
        paragraph2:
          "Mix flour + PB powder + salt → knead dough → rest 10 min → roll and cook like normal roti.\r\n\r\n🧮 Nutrition Per 1 Roti\r\nNutrient\t     Amount\r\nCalories\t    ~130 kcal\r\nProtein\t     7.5 g\r\nCarbs\t    18 g\r\nFat\t            1.5 g\r\n\r\n\r\nDisclaimer\r\n\r\nNutritional values are approximate and may vary depending on ingredients and cooking method.\r\n\r\n👉 Perfect for fitness roti, gym diet, diabetic-friendly",
        img: blogImages[3], // recipeFour.png
      },
      {
        header: "Protein Chocolate Mug Cake",
        subheader1: "Ingredients :-\r\n",
        paragraph1:
          "- Wheat flour – 30 g\r\n\r\n- Chocolate  PB powder – 30 g\r\n\r\n- Milk  – 80 ml\r\n\r\n- Baking powder – ¼ tsp\r\n\r\n- Jaggery/sugar – 10 g",
        subheader2: "Method:-",
        paragraph2:
          "Mix flour + PB powder + salt → knead dough → rest 10 min → roll and cook like normal roti.\r\n\r\n🧮 Nutrition Per 1 Roti\r\nNutrient\t     Amount\r\nCalories\t    ~130 kcal\r\nProtein\t     7.5 g\r\nCarbs\t    18 g\r\nFat\t            1.5 g\r\n\r\n\r\nDisclaimer\r\n\r\nNutritional values are approximate and may vary depending on ingredients and cooking method.\r\n\r\n👉 Perfect for fitness roti, gym diet, diabetic-friendly",
        img: blogImages[4], // recipeFour.png
      },
      {
        header: "Protein Peanut Butter Shake",
        subheader1: "Ingredients :-\r\n",
        paragraph1:
          "- Milk – 250 ml\r\n\r\n- Banana – 1\r\n\r\n- PB Original powder – 30 g",
        subheader2: "Method:-",
        paragraph2:
          "Mix flour + PB powder + salt → knead dough → rest 10 min → roll and cook like normal roti.\r\n\r\n🧮 Nutrition Per 1 Roti\r\nNutrient\t     Amount\r\nCalories\t    ~130 kcal\r\nProtein\t     7.5 g\r\nCarbs\t    18 g\r\nFat\t            1.5 g\r\n\r\n\r\nDisclaimer\r\n\r\nNutritional values are approximate and may vary depending on ingredients and cooking method.\r\n\r\n👉 Perfect for fitness roti, gym diet, diabetic-friendly",
        img: blogImages[5], // recipeFour.png
      },
    ];

    for (const blog of blogsSeed) {
      const imageUrl = await uploadToStorage(blog.img!, "blogs");

      await supabase.from("blogs").insert({
        user_id: adminId,
        header: blog.header,
        subheader1: blog.subheader1,
        paragraph1: blog.paragraph1,
        subheader2: blog.subheader2,
        paragraph2: blog.paragraph2,
        image_urls: [imageUrl],
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

