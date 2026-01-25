export interface AddToCartRequest {
  product_id: string;
  weight: string;
  quantity?: number;
  userId?: string | null;
  sessionId: string;
}

export interface RemoveFromCartRequest {
  product_id: string;
  size: string;
  sessionId: string;
  userId?: string | null;
  cartId?: string | null;
}

export interface CartItem {
  product_id: string;
  total_weight?: string;
  quantity: number;
  price: number;
  total_price: number;
}

export interface CartResponse {
  id: string | null;
  created_at: string | null;
  user_id: string | null;
  session_id?: string | null;
  items: CartItem[];
  product_count: number;
  total_price: number;
}

export interface CartAPIResponse {
  errorCode: string;
  cart?: CartResponse;
  error?: any;
}
