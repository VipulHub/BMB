
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
    errorCode:'NO_ERROR' | 'Invalid_Credentials' | 'Server Error' | 'Auth_Create_Failed' | 'DB_Insert_Failed'
    data?:{
        session:string,
        user:User
    }
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
  error?: any;
}

export type {
    User,
    createUserRequestBody,
    getAllUserData,
    SignLoginResponse,
    SignOutResponse,
    OtpAuthRequest,
    OtpAuthResponse
}