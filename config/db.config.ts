import { createClient } from '@supabase/supabase-js'
import { env } from './envConfig.ts'

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
)


export default supabase
