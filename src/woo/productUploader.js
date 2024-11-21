import fs from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"
import WooCommerceAPI from "./wooAPI.js"
import { formatProduct } from "./productFormatter.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

class ProductUploader {
  constructor(config) {
    this.wooAPI = new WooCommerceAPI(config)
    this.failedProducts = []
    this.processedProducts = []
    this.filterCategories = config.filterCategories || null
  }

  filterProductsByCategory(products) {
    if (!this.filterCategories || this.filterCategories.length === 0) {
      return products
    }

    return products.filter((product) => {
      return product.categories.some((category) =>
        this.filterCategories.includes(category.toLowerCase())
      )
    })
  }

  async processProducts(inputFile) {
    try {
      // Test API connection first
      await this.wooAPI.testConnection()

      // Read input file
      console.log(`Reading products from ${inputFile}`)
      const rawData = await fs.readFile(inputFile, "utf8")
      let products
      try {
        products = JSON.parse(rawData)
        if (!Array.isArray(products)) {
          throw new Error("Products data must be an array")
        }
      } catch (error) {
        throw new Error(`Failed to parse products JSON: ${error.message}`)
      }

      // Filter products by category if needed
      const filteredProducts = this.filterProductsByCategory(products)
      console.log(`Found ${filteredProducts.length} products after filtering`)

      if (filteredProducts.length === 0) {
        console.warn("No products to process after filtering")
        return
      }

      // Format and validate products
      const formattedProducts = []
      for (const product of filteredProducts) {
        try {
          const formatted = formatProduct(product)
          // Basic validation
          if (!formatted.name || !formatted.sku || !formatted.regular_price) {
            throw new Error(
              `Missing required fields for product ${
                formatted.sku || "unknown"
              }`
            )
          }
          formattedProducts.push(formatted)
        } catch (error) {
          console.error(`Failed to format product:`, error)
          this.failedProducts.push({
            sku: product.sku || "unknown",
            error: `Formatting error: ${error.message}`,
            product: product,
          })
        }
      }

      // Save formatted products for debugging
      const formattedPath = path.join(
        __dirname,
        `../../products/${process.env.PRODUCT}_formatted.json`
      )
      await fs.writeFile(
        formattedPath,
        JSON.stringify(formattedProducts, null, 2)
      )
      console.log(`Saved formatted products to ${formattedPath}`)

      console.log(`Processing ${formattedProducts.length} products...`)

      // Upload products with delay between requests
      for (const product of formattedProducts) {
        try {
          // Add some basic validation before upload
          if (!product.name || !product.sku || !product.regular_price) {
            throw new Error(
              `Missing required fields for product ${product.sku || "unknown"}`
            )
          }

          await this.uploadWithRetry(product)
          this.processedProducts.push({
            sku: product.sku,
            status: "success",
          })

          // Add delay between requests to prevent API strain
          await new Promise((resolve) => setTimeout(resolve, 5000))
        } catch (error) {
          console.error(
            `Failed to upload product ${product.sku}:`,
            error.message
          )
          if (error.response?.data) {
            console.error(
              "API Error Details:",
              JSON.stringify(error.response.data, null, 2)
            )
          }

          this.failedProducts.push({
            sku: product.sku,
            error: error.message,
            details: error.response?.data,
            product: product,
          })

          // Save results after each failure for safety
          await this.saveResults()
        }
      }

      // Final save of results
      await this.saveResults()

      // Log final summary
      console.log("\nUpload Summary:")
      console.log(`Total products processed: ${formattedProducts.length}`)
      console.log(`Successfully uploaded: ${this.processedProducts.length}`)
      console.log(`Failed to upload: ${this.failedProducts.length}`)

      if (this.failedProducts.length > 0) {
        console.log(
          "\nFailed products have been saved to the _failed.json file"
        )
      }
    } catch (error) {
      console.error("Failed to process products:", error)
      throw error
    }
  }

  async uploadWithRetry(product, retries = 3) {
    let lastError
    for (let i = 0; i < retries; i++) {
      try {
        const result = await this.wooAPI.uploadProduct(product)
        if (result) {
          console.log(
            `Successfully uploaded product ${product.sku} on attempt ${i + 1}`
          )
          return result
        }
      } catch (error) {
        lastError = error
        console.error(
          `Upload attempt ${i + 1} failed for SKU ${product.sku}:`,
          error.message
        )

        if (
          error.response?.data?.code ===
            "woocommerce_rest_product_not_created" &&
          error.response?.data?.message?.includes("already under processing")
        ) {
          // For processing conflicts, wait longer
          console.log(
            `Product ${product.sku} is under processing, waiting 30 seconds...`
          )
          await new Promise((resolve) => setTimeout(resolve, 30000)) // 30 second delay
        } else if (i === retries - 1) {
          break // Will throw error after loop
        } else {
          // For other errors, use exponential backoff with longer initial delay
          const delay = 5000 * Math.pow(2, i) // Starts at 5s, then 10s, then 20s
          console.log(`Retrying in ${delay / 1000} seconds...`)
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
      }
    }

    // If we get here, all retries failed
    throw (
      lastError ||
      new Error(
        `Failed to upload product ${product.sku} after ${retries} attempts`
      )
    )
  }

  async saveResults() {
    await fs.writeFile(
      path.join(__dirname, `../../products/${process.env.PRODUCT}_failed.json`),
      JSON.stringify(this.failedProducts, null, 2)
    )

    await fs.writeFile(
      path.join(
        __dirname,
        `../../products/${process.env.PRODUCT}_success.json`
      ),
      JSON.stringify(this.processedProducts, null, 2)
    )
  }
}

export default ProductUploader
