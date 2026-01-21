// src/modules/payment/types.ts

export type CustomerInfo = {
  first_name: string;
  last_name: string;
  email: string;
};

export type AddressInfo = {
  address_line: string;
  locality: string;
  city: string;
  state: string;
  country: string;
  pincode: string;
};

export type CartSummary = {
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  couponId?: string | null;
};

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
  customer: CustomerInfo;
  address: AddressInfo;
  couponId?: string | null;
};

export type CreateOrderResponse = {
  errorCode: "NO_ERROR" | "Server_Error";
  data?: CreateOrderResponseData;
  error?: any;
};
