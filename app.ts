

import express, { type Express } from "express"
import registerApp from "./routes/index.js"


const app: Express = express()

await registerApp(app)