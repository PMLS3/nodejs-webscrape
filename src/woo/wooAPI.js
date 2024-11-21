import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api"
import fs from "fs/promises"
import path from "path"

class WooCommerceAPI {
  constructor(config) {
    if (!config.url || !config.consumerKey || !config.consumerSecret) {
      throw new Error("Missing required WooCommerce API configuration")
    }

    try {
      this.api = new WooCommerceRestApi.default({
        url: config.url,
        consumerKey: config.consumerKey,
        consumerSecret: config.consumerSecret,
        version: "wc/v3",
        queryStringAuth: true, // Force Basic Authentication as query string
      })

      this.categoryCache = new Map()
      this.tagCache = new Map()
    } catch (error) {
      console.error("Failed to initialize WooCommerce API:", error)
      throw error
    }
  }

  async testConnection() {
    try {
      await this.api.get("products", { per_page: 1 })
      console.log("WooCommerce API connection successful")
      return true
    } catch (error) {
      console.error("WooCommerce API connection failed:", error.message)
      throw error
    }
  }

  async getOrCreateCategory(categoryName) {
    if (!categoryName) {
      console.warn("Skipping undefined category")
      return null
    }

    try {
      if (this.categoryCache.has(categoryName)) {
        console.log(`Using cached category ID for ${categoryName}`)
        return this.categoryCache.get(categoryName)
      }

      // Check if category exists - use exact name match
      const { data: existingCategories } = await this.api.get(
        "products/categories",
        {
          search: categoryName,
          per_page: 100, // Increase to ensure we get all categories
        }
      )

      let category = existingCategories.find(
        (c) => c.name.toLowerCase() === categoryName.toLowerCase()
      )

      if (!category) {
        console.log(`Creating new category: ${categoryName}`)
        // Create new category
        const { data: newCategory } = await this.api.post(
          "products/categories",
          {
            name: categoryName,
          }
        )
        category = newCategory
      } else {
        console.log(
          `Found existing category: ${categoryName} (ID: ${category.id})`
        )
      }

      this.categoryCache.set(categoryName, category.id)
      return category.id
    } catch (error) {
      console.error(
        `Failed to process category ${categoryName}:`,
        error.message
      )
      if (error.response?.data) {
        console.error(
          "API Error Details:",
          JSON.stringify(error.response.data, null, 2)
        )
      }
      return null
    }
  }

  async getOrCreateTag(tagName) {
    if (!tagName) {
      console.warn("Skipping undefined tag")
      return null
    }

    try {
      if (this.tagCache.has(tagName)) {
        console.log(`Using cached tag ID for ${tagName}`)
        return this.tagCache.get(tagName)
      }

      // Check if tag exists - use exact name match
      const { data: existingTags } = await this.api.get("products/tags", {
        search: tagName,
        per_page: 100, // Increase to ensure we get all tags
      })

      let tag = existingTags.find(
        (t) => t.name.toLowerCase() === tagName.toLowerCase()
      )

      if (!tag) {
        console.log(`Creating new tag: ${tagName}`)
        // Create new tag
        const { data: newTag } = await this.api.post("products/tags", {
          name: tagName,
        })
        tag = newTag
      } else {
        console.log(`Found existing tag: ${tagName} (ID: ${tag.id})`)
      }

      this.tagCache.set(tagName, tag.id)
      return tag.id
    } catch (error) {
      console.error(`Failed to process tag ${tagName}:`, error.message)
      if (error.response?.data) {
        console.error(
          "API Error Details:",
          JSON.stringify(error.response.data, null, 2)
        )
      }
      return null
    }
  }

  async uploadProduct(product) {
    try {
      // First check if product with SKU already exists
      try {
        const { data: existingProducts } = await this.api.get("products", {
          sku: product.sku,
        })

        if (existingProducts && existingProducts.length > 0) {
          const existingProduct = existingProducts[0]
          if (existingProduct.status === "publish") {
            throw new Error(
              `Product with SKU ${product.sku} already exists and is published`
            )
          }
          // If product exists but not published, try to delete it first
          await this.api.delete(`products/${existingProduct.id}`, {
            force: true,
          })
          console.log(`Deleted existing product with SKU ${product.sku}`)
          // Wait a bit after deletion
          await new Promise((resolve) => setTimeout(resolve, 5000))
        }
      } catch (error) {
        if (!error.response || error.response.status !== 404) {
          console.warn(`Error checking existing product: ${error.message}`)
        }
      }

      // Process categories and tags first before product upload
      console.log(`Processing categories and tags for product ${product.sku}`)

      // Filter and process categories
      const validCategories = (product.categories || [])
        .filter((cat) => cat && cat.name)
        .map((cat) => cat.name)

      console.log(`Processing ${validCategories.length} categories`)
      const categoryIds = []
      for (const catName of validCategories) {
        try {
          const catId = await this.getOrCreateCategory(catName)
          if (catId) categoryIds.push({ id: catId })
        } catch (error) {
          console.error(`Failed to process category ${catName}:`, error.message)
        }
      }
      product.categories = categoryIds

      // Filter and process tags
      const validTags = (product.tags || [])
        .filter((tag) => tag && tag.name)
        .map((tag) => tag.name)

      console.log(`Processing ${validTags.length} tags`)
      const tagIds = []
      for (const tagName of validTags) {
        try {
          const tagId = await this.getOrCreateTag(tagName)
          if (tagId) tagIds.push({ id: tagId })
        } catch (error) {
          console.error(`Failed to process tag ${tagName}:`, error.message)
        }
      }
      product.tags = tagIds

      // Log the processed categories and tags
      console.log("Processed categories:", JSON.stringify(product.categories))
      console.log("Processed tags:", JSON.stringify(product.tags))

      // Ensure required fields have values
      if (!product.name) throw new Error("Product name is required")
      if (!product.type) product.type = "simple"
      if (!product.regular_price) throw new Error("Regular price is required")

      // Upload product with increased timeout
      const { data } = await this.api.post("products", product, {
        timeout: 30000, // 30 second timeout
      })
      console.log(
        `Successfully uploaded product: ${product.name} (SKU: ${product.sku})`
      )
      return data
    } catch (error) {
      console.error(
        `Failed to upload product ${product.name || "unknown"}:`,
        error.message
      )
      if (error.response?.data) {
        console.error(
          "API Error Details:",
          JSON.stringify(error.response.data, null, 2)
        )
      }
      throw error
    }
  }
}

export default WooCommerceAPI
