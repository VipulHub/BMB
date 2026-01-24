/* =========================================================
   CUSTOMER & ADDRESS
========================================================= */

export type CustomerInfo = {
  first_name: string;
  last_name: string;
  email: string;
};

export type AddressInfo = {
  address_line: string;
  locality?: string | null;
  city: string;
  state: string;
  country: string;
  pincode: string;
};

/* =========================================================
   CART
========================================================= */

export type CartSummary = {
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  couponId?: string | null;      // UUID (preferred)
  couponCode?: string | null;    // fallback
};

/* =========================================================
   CREATE ORDER
========================================================= */

export type CreateOrderRequest = {
  customer: CustomerInfo;
  address: AddressInfo;
  payment_method: "ONLINE" | "COD";
  cart: CartSummary;
  userId: string;
};

export type CreateOrderResponseData = {
  order_id: string;
  razorpay_order_id: string;
  amount: number;
  currency: string;
};

export type CreateOrderResponse = {
  errorCode: "NO_ERROR" | "SERVER_ERROR" | "USER_NOT_FOUND";
  data?: CreateOrderResponseData;
  error?: any;
};

/* =========================================================
   VERIFY PAYMENT
========================================================= */

export type VerifyPaymentRequest = {
  order_id: string;                // internal DB order id
  razorpay_order_id?: string;      // required for ONLINE
  razorpay_payment_id?: string;    // required for ONLINE
  razorpay_signature?: string;     // required for ONLINE
};

export type VerifyPaymentResponse = {
  errorCode:
    | "NO_ERROR"
    | "INVALID_SIGNATURE"
    | "ORDER_NOT_FOUND"
    | "SERVER_ERROR";
  data?: {
    order_id: string;
    payment_id: string | null;     // null for COD
    status: "paid" | "COD";
    tracking_number?: string | null;
  };
  error?: any;
};

/* =========================================================
   GET ALL ORDERS
========================================================= */

export type OrderStatus =
  | "pending"
  | "paid"
  | "cod_confirmed";

export type PaymentStatus =
  | "initiated"
  | "success"
  | "failed"
  | "pending";

export type ShippingStatus =
  | "created"
  | "manifested"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "failed"
  | null;

export type GetAllOrdersResponse = {
  errorCode: "NO_ERROR" | "SERVER_ERROR";
  data?: Array<{
    order_id: string;
    created_at: string;
    order_status: OrderStatus;
    total_amount: number;
    product_ids: string[];
    product_count: number;

    payment: {
      method: "ONLINE" | "COD" | null;
      status: PaymentStatus | null;
      amount: number | null;
      paid_at: string | null;
      razorpay_payment_id: string | null;
    };

    shipping: {
      status: ShippingStatus;
      tracking_number: string | null;
      location: string | null;
      expected_delivery: string | null;
    };
  }>;
  error?: any;
};
