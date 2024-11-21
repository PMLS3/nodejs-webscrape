import { ChatVertexAI } from "@langchain/google-vertexai"

export class ProductProcessorNode {
  constructor() {
    process.env.GOOGLE_APPLICATION_CREDENTIALS =
      "/Users/peetstander/Projects/scrape/application_default_credentials.json"

    this.llm = new ChatVertexAI({
      model: "gemini-1.5-pro",
      temperature: 0,
      project: "omni-connect-9b23d",
      maxOutputTokens: 2048,
    })

    const productSchema = {
      name: "product",
      description: "Extract product information from HTML content",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Full product name including model number",
          },
          brand: { type: "string", description: "Product brand/manufacturer" },
          sku: { type: "string", description: "Product SKU/ID" },
          description: {
            type: "string",
            description: "Full product description",
          },
          short_description: {
            type: "string",
            description: "Brief product description under 160 characters",
          },
          price: {
            type: "object",
            properties: {
              current: { type: "number", description: "Current price" },
              regular: {
                type: "number",
                description: "Regular price if different from current",
              },
              sale: { type: "number", description: "Sale price if available" },
            },
            required: ["current"],
          },
          stock_status: { type: "string", description: "Current stock status" },
          images: {
            type: "array",
            items: {
              type: "object",
              properties: {
                src: { type: "string", description: "Full image URL" },
                alt: {
                  type: "string",
                  description: "Image alt text/description",
                },
              },
              required: ["src", "alt"],
            },
          },
          specifications: {
            type: "object",
            properties: {
              technical: {
                type: "array",
                items: { type: "string" },
                description: "Array of technical specifications",
              },
              features: {
                type: "array",
                items: { type: "string" },
                description: "Array of product features",
              },
              additional: {
                type: "object",
                description: "Additional specifications",
              },
            },
            required: ["technical", "features", "additional"],
          },
          documents: {
            type: "object",
            properties: {
              datasheet: {
                type: "string",
                description: "Datasheet URL if available",
              },
              manual: {
                type: "string",
                description: "Manual URL if available",
              },
              certificates: {
                type: "array",
                items: { type: "string" },
                description: "Array of certificate URLs",
              },
            },
            required: ["certificates"],
          },
          categories: {
            type: "array",
            items: {
              type: "string",
              description:
                "Product categories, separated by commas either inverter, battery, solar panel, geyesers, e-bike, packages or accessories",
            },
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Product tags",
          },
        },
        required: [
          "name",
          "brand",
          "sku",
          "description",
          "short_description",
          "price",
          "stock_status",
          "images",
          "specifications",
          "documents",
          "categories",
          "tags",
        ],
      },
    }

    this.structuredLlm = this.llm.withStructuredOutput(productSchema, {
      method: "json_mode",
      includeRaw: true,
    })
  }

  async process(document) {
    try {
      if (!this.isProductPage(document.pageContent, document.url)) {
        console.log("❌ Not a product page:", document.url)
        return null
      }

      console.log("✨ Processing product page:", document.url)

      // Add retry logic with delay
      const maxRetries = 3
      let retryCount = 0

      while (retryCount < maxRetries) {
        try {
          const result = await this.structuredLlm.invoke(
            `Extract product information from this HTML content. If categories are not explicitly found, analyze the product details and classify it into ONE of these categories: inverter, battery, solar panel, geyesers, e-bike, packages or accessories. If no tags are found, generate relevant tags based on the product's features and specifications: ${document.pageContent}`
          )

          const extractedData =
            result?.parsed || (result?.raw ? JSON.parse(result.raw) : null)

          if (!extractedData) {
            console.log("❌ Failed to extract data from:", document.url)
            return null
          }

          console.log(
            `✅ Successfully extracted data for: ${extractedData.name}`
          )
          return extractedData
        } catch (error) {
          // Check for rate limit in different ways since error structure might vary
          const errorMessage = error?.message || error?.toString() || ""
          const errorDetails = error?.response?.data || error?.response || error

          const isRateLimit =
            errorMessage.includes("rateLimitExceeded") ||
            errorDetails?.error?.message?.includes("rateLimitExceeded") ||
            errorDetails?.errors?.[0]?.reason === "rateLimitExceeded"

          if (isRateLimit) {
            retryCount++
            if (retryCount < maxRetries) {
              console.log(
                `⏳ Rate limit hit, waiting 90 seconds before retry ${retryCount}/${maxRetries}...`
              )
              await new Promise((resolve) => setTimeout(resolve, 90000)) // 90 second delay
              continue
            }
          }

          // Log the full error for debugging
          console.error("Error during extraction:", {
            message: errorMessage,
            details: errorDetails,
            url: document.url,
          })

          if (retryCount >= maxRetries) {
            console.error(
              `❌ Max retries (${maxRetries}) reached for:`,
              document.url
            )
            return null
          }

          // For non-rate-limit errors, increment retry counter and try again
          retryCount++
          console.log(`Retrying... Attempt ${retryCount}/${maxRetries}`)
          await new Promise((resolve) => setTimeout(resolve, 5000)) // 5 second delay for other errors
        }
      }

      return null
    } catch (error) {
      console.error("Fatal error processing product:", error)
      return null
    }
  }

  isProductPage(content, url) {
    return url.includes("/product/")
  }
}
