import path from "path"
import { fileURLToPath } from "url"
import ProductUploader from "./woo/productUploader.js"
import dotenv from "dotenv"

// Load environment variables
dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Validate environment variables
const requiredEnvVars = [
  "WOOCOMMERCE_URL",
  "WOOCOMMERCE_KEY",
  "WOOCOMMERCE_SECRET",
]
const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar])

if (missingEnvVars.length > 0) {
  console.error(
    "Missing required environment variables:",
    missingEnvVars.join(", ")
  )
  process.exit(1)
}

// Configuration object with optional category filter
const config = {
  url: process.env.WOOCOMMERCE_URL,
  consumerKey: process.env.WOOCOMMERCE_KEY,
  consumerSecret: process.env.WOOCOMMERCE_SECRET,
  // Only set filterCategories from command line arguments
  filterCategories: null,
}

async function run() {
  try {
    console.log("Initializing uploader with config:", {
      url: config.url,
      hasKey: !!config.consumerKey,
      hasSecret: !!config.consumerSecret,
      filterCategories: config.filterCategories,
    })

    const uploader = new ProductUploader(config)

    await uploader.processProducts(
      path.join(__dirname, `../products/${process.env.PRODUCT}.json`)
    )

    console.log("Upload process completed")
  } catch (error) {
    console.error("Upload process failed:", error)
    process.exit(1)
  }
}

// Allow running with command line arguments
if (process.argv.length > 2) {
  const categories = process.argv.slice(2)
  config.filterCategories = categories.map((cat) => cat.toLowerCase())
  console.log(`Filtering products by categories: ${categories.join(", ")}`)
}

run().catch((error) => {
  console.error("Fatal error:", error)
  process.exit(1)
})
