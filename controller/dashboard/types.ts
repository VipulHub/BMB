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
  size_prices?: Record<string, number>;        // map of size -> price
  discounted_prices?: Record<string, number>;  // map of size -> discounted price
  price?: number; // optional if you want a default
  priority:number
};


/* ===============================
   BLOG
================================ */
export type Blog = {
  id: string;
  created_at: string | null;
  user_id: string;
  header: string;
  details: string;
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
  cart: Cart;
  cartCount: number, 
  coupons: Coupon[];
};

/* ===============================
   API RESPONSE
================================ */
export type GetDashboardResponse = {
  errorCode: "NO_ERROR" | "Server_Error";
  data?: DashboardData;
  error?: any;
  sessionId?:string
};
