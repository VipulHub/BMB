
interface User {
  id: string;
  created_at: string;
  name: string;
  email: string;
  password_hash: string;
  type: "user" | "admin";
  phone_number: string | null;
  address: string | null;
}
interface createUserRequestBody {
  name: string;
  email: string;
  password_hash: string;
  type: "user" | "admin";
  phone_number: string | null;
  address: string | null;
}
type getAllUserData = {
  errorCode: "NO_ERROR" | "Server Error",
  data: User
}

type SignLoginResponse = {
  errorCode: string;
  message?: string;
  userId?: string;
  user?: {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  };
  address?: {
    address: string | null;
    locality: string | null;
    pincode: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
  } | {};
  error?: any;
}
type SignOutResponse = {
  errorCode: 'NO_ERROR' | 'Server_Error' | 'Invalid_Token';
}
interface OtpAuthRequest {
  otp: string;
}
interface OtpAuthResponse {
  errorCode: string;
  message?: string;
  userId?: string;
  token?: string;
  user?: {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: number | null
  };
  address?: {
    address: string | null;
    locality: string | null;
    pincode: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
  } | {};
  error?: any;
}

interface CreateLeadRequestBody {
  phoneNumber: string;
  email: string;
  sessionId: string;
}

type CreateLeadResponse = {
  errorCode: "NO_ERROR" | "Server_Error";
  message?: string;
  leadId?: string;
  error?: any;
};

type UpdateAccountRequest = {
  operation?: "UPDATE" | "DELETE_ADDRESS";

  // PROFILE
  firstName?: string;
  lastName?: string;
  email?: string;
  mobile?: string;

  // ADDRESS
  address?: string;
  locality?: string;
  pincode?: string;
  city?: string;
  state?: string;
  country?: string;
};


export type UserAddressItem = {
  id: string;
  address: string;
  locality: string;
  pincode: string;
  city: string;
  state: string;
  country: string;
  isDefault: boolean;
};

export type UpdateAccountSuccessResponse = {
  errorCode: "NO_ERROR";
  message: string;
  userId: string;
  user: {
    firstName: string;
    lastName: string;
    email: string;
    mobile: string;
  };
  // ✅ return ALL addresses
  addresses: UserAddressItem[];
};

export type UpdateAccountErrorResponse = {
  errorCode: "INVALID_REQUEST" | "UNAUTHORIZED" | "EMAIL_IN_USE" | "SERVER_ERROR";
  message: string;
};

type UpdateAccountResponse = UpdateAccountSuccessResponse | UpdateAccountErrorResponse;

export type {
  User,
  createUserRequestBody,
  getAllUserData,
  SignLoginResponse,
  SignOutResponse,
  OtpAuthRequest,
  OtpAuthResponse,
  CreateLeadResponse,
  CreateLeadRequestBody,
  UpdateAccountRequest,
  UpdateAccountResponse
}