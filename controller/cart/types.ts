export interface AddToCartRequest {
  product_id: string;
  quantity?: number;
  weight: string;
  userId?: string;
  sessionId?: string;
  offerId?: string;
}

export interface RemoveFromCartRequest {
  product_id: string;
  weight: string;
  sessionId: string;
  userId?: string | null;
  cartId?: string | null;
  checkDelete?: boolean | null;
  offerId?:string
}

export interface CartItem {
  product_id: string;

  // ✅ use paise (integer)
  price: number;        // unit price in paise
  quantity: number;
  total_price: number;  // line total in paise

  product_name?: string;
  product_image?: string;
  product_type?: string;

  total_weight?: string;
  size?: string;

  originalPrice?: number;        // in paise
  total_original_price?: number; // in paise

  offer_id?: string; // ✅ send back offerId
}

export interface CartResponse {
  id: string | null;
  created_at: string | null;
  user_id: string | null;
  session_id?: string | null;
  items: CartItem[];
  product_count: number;

  // ✅ cart total in paise
  total_price: number;
}

export interface CartAPIResponse {
  errorCode: string;
  cart?: CartResponse;
  error?: any;
}