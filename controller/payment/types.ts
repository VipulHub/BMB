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
  couponId?: string | null; // can be UUID
  couponCode?: string | null; // fallback if couponId not provided
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
  errorCode: "NO_ERROR" | "Server_Error" | "USER_NOT_FOUND";
  data?: CreateOrderResponseData;
  error?: any;
};

// src/modules/payment/types.ts

export type VerifyPaymentRequest = {
  order_id: string;              // your DB order id
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

export type VerifyPaymentResponse = {
  errorCode: "NO_ERROR" | "INVALID_SIGNATURE" | "ORDER_NOT_FOUND" | "Server_Error";
  data?: {
    order_id: string;
    payment_id: string;
    status: "paid";
    shipment?: {
      waybill?: string;
      status?: string;
      location?: string;
      expected_delivery?: string | null;
      raw?: any; // optional raw response from Delhivery API
    };
  };
  error?: any;
};
