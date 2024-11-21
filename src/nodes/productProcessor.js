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
    return url.includes("csisolar.com/")
  }
  isProductPages(content, url) {
    // Check for /pi in URL (new site structure)
    if (url.includes("/pi")) {
      return true
    }

    // Additional checks to confirm it's a product page
    const hasProductElements =
      content.includes('script type="application/ld+json"') && // Has structured data
      content.includes("SKU:") && // Has SKU
      content.includes("Product Description") // Has product description tab

    return hasProductElements
  }

  async _processPage(page, url) {
    try {
      // First try to get the JSON-LD data as it's well structured
      const jsonLd = await page.evaluate(() => {
        const script = document.querySelector(
          'script[type="application/ld+json"]'
        )
        return script ? JSON.parse(script.textContent) : null
      })

      // Extract the main product content
      const content = await page.evaluate(() => {
        const getTextContent = (selector) => {
          const element = document.querySelector(selector)
          return element ? element.textContent.trim() : ""
        }

        // Get price (both VAT and non-VAT)
        const priceText =
          document.querySelector('font[color="#327763"]')?.textContent || ""
        const priceMatch = priceText.match(/R\s*([\d,]+\.?\d*)/)
        const priceExclVAT =
          document.querySelector('font[color="#bb5555"]')?.textContent || ""
        const priceExclMatch = priceExclVAT.match(/R\s*([\d,]+\.?\d*)/)

        // Get SKU
        const skuText = document.querySelector('b:contains("SKU:")')
        const sku = skuText ? skuText.nextSibling.textContent.trim() : ""

        // Get description from tab content
        const description =
          document.querySelector("#1")?.textContent.trim() || ""

        // Get documents
        const documents = Array.from(
          document.querySelectorAll("#3 table a")
        ).map((a) => ({
          name: a.textContent.trim(),
          url: new URL(a.href, window.location.href).href,
        }))

        // Get breadcrumb categories
        const categories = Array.from(
          document.querySelectorAll(".breadcrumb a small")
        )
          .map((el) => el.textContent.trim())
          .filter((text) => text !== "SHOP")

        return {
          title: document.querySelector("h1")?.textContent.trim(),
          price: {
            current: priceMatch
              ? parseFloat(priceMatch[1].replace(",", ""))
              : null,
            excludingVAT: priceExclMatch
              ? parseFloat(priceExclMatch[1].replace(",", ""))
              : null,
          },
          sku,
          description,
          documents,
          categories,
          brand: document
            .querySelector('a[style*="color: #bb5555"]')
            ?.textContent.trim(),
          images: Array.from(
            document.querySelectorAll("img.img-responsive")
          ).map((img) => ({
            src: new URL(img.src, window.location.href).href,
            alt: img.alt,
          })),
        }
      })

      // Combine JSON-LD data with scraped content
      const productData = {
        name: content.title || jsonLd?.name,
        brand: content.brand || jsonLd?.brand?.name,
        sku: content.sku,
        description: content.description,
        short_description: content.description.split("\n")[0], // First paragraph
        price: {
          current: content.price.current,
          regular: content.price.excludingVAT,
        },
        stock_status: "instock", // Could be enhanced if status info is available
        images: content.images,
        specifications: {
          technical: [], // Would need to be extracted if available
          features: content.description
            .split("\n")
            .filter((line) => line.trim()), // Split description into features
          additional: {
            sku: content.sku,
            priceExcludingVAT: content.price.excludingVAT,
          },
        },
        documents: {
          datasheet:
            content.documents.find((d) =>
              d.name.toLowerCase().includes("specification")
            )?.url || "",
          manual:
            content.documents.find((d) =>
              d.name.toLowerCase().includes("manual")
            )?.url || "",
          certificates: [],
        },
        categories: [this._determineMainCategory(content.categories)],
        tags: this._generateTags(content.title, content.description),
      }

      return productData
    } catch (error) {
      console.error(`Error processing ${url}:`, error)
      return null
    }
  }

  _determineMainCategory(categories) {
    // Map site categories to our standard categories
    const categoryMap = {
      INVERTERS: "inverter",
      BATTERIES: "battery",
      "SOLAR PANELS": "solar panel",
      GEYSERS: "geysers",
      "E-BIKES": "e-bike",
      PACKAGES: "packages",
      ACCESSORIES: "accessories",
    }

    // Look through categories and find the first match
    for (const category of categories) {
      const upperCategory = category.toUpperCase()
      for (const [key, value] of Object.entries(categoryMap)) {
        if (upperCategory.includes(key)) {
          return value
        }
      }
    }

    // If no match found, analyze the product name and description to determine category
    // This would need to be implemented based on your specific needs
    return "accessories" // Default category
  }

  _generateTags(title, description) {
    // Implement tag generation logic based on title and description
    // This would need to be implemented based on your specific needs
    return []
  }
}
