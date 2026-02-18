/* ===============================
   PRODUCT
================================ */
export type Product = {
  id: string;
  created_at: string | null;
  user_id: string;
  name: string;
  description: string | null;
  stock: number;
  product_type: string | null;
  image_urls: string[];
  sizes?: string[];
  size_prices?: Record<string, number>;
  discounted_prices?: Record<string, number>;
  price?: number;
  priority: number;

  /* ✅ NEW: offers per product */
  offers?: ProductOffer[];
};

/* ===============================
   BLOG
================================ */
export type Blog = {
  id: string;
  created_at: string | null;
  user_id: string;
  header: string;
  paragraph1: string;
  subHeader1: string,
  subHeader2: string
  paragraph2: string,
  image_urls: string[];
};

/* ===============================
   CART ITEM (ENRICHED)
================================ */
export type CartItem = {
  product_id: string;
  quantity: number;
  price: number;
  total_price: number;

  /* optional for new weight-based cart */
  size?: string;
  originalPrice?: number;
  total_original_price?: number;

  /* frontend helpers */
  product_name?: string | null;
  product_image?: string | null;
  product_type?: string | null;
};

/* ===============================
   CART
================================ */
export type Cart = {
  id?: string;
  created_at?: string | null;
  user_id?: string | null;
  session_id?: string | null;
  items: CartItem[];
  product_count: number;
  total_price: number;

  /* optional for new cart version */
  total_original_price?: number;
};

/* ===============================
   COUPON
================================ */
export type Coupon = {
  id: string;
  code: string;
  discount_percent: number;
  valid_from: string | null;
  valid_to: string | null;

  /* scope */
  product_id?: string | null;
  product_type?: string | null;

  /* frontend logic */
  applicable_to_cart: boolean;
};

/* ===============================
   DASHBOARD DATA
================================ */
export type DashboardData = {
  products: Product[];
  blogs: Blog[];
  cart: Cart;        // legacy cart
  cart_v2?: Cart;    // new API-style cart (add/remove compatible)
  cartCount: number;
  coupons: Coupon[];
};

/* ===============================
   API RESPONSE
================================ */
export type GetDashboardResponse = {
  errorCode: "NO_ERROR" | "Server_Error";
  data?: DashboardData;
  error?: any;
  sessionId?: string;
};
/* ===============================
   PRODUCT OFFER
================================ */
export type ProductOffer = {
  id: string;
  product_id: string;
  min_quantity: number;        // Buy 1, Buy 2, etc.
  discount_percent: number;    // 10 = 10%
};