type Product = {
    id: string;                         // uuid
    created_at: string | null;          // timestamp
    user_id: string;                    // uuid (FK → users)
    name: string;                       // text
    description: string | null;         // text
    price: number;                      // numeric(10,2)
    stock: number;                      // int
    product_type: string | null;        // text
    image_urls: string[];               // text[]
};

type getProductResponse = {
    errorCode: 'NO_ERROR' | 'Server_Error'
    data?: Product[]
    error?:any
}

type AddProductResponse = {
    errorCode: 'NO_ERROR' | 'Server_Error'
    error?:any
}


export type {
    getProductResponse,
    AddProductResponse
}