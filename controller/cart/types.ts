export interface AddToCartRequest {
  product_id: string;
  quantity?: number;
  weight: string;
  userId?: string;
  sessionId?: string;
}

export interface RemoveFromCartRequest {
  product_id: string;
  weight: string;
  sessionId: string;
  userId?: string | null;
  cartId?: string | null;
  checkDelete?:boolean | null;
}

export interface CartItem {
  product_id: string;
  price: number;
  quantity: number;
  total_price: number;
  product_name?: string;
  product_image?: string;
  product_type?: string;
  total_weight?: string;
  size?: string; // <-- added for weight/size
  originalPrice?: number;
  total_original_price?: number;
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
