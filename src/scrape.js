import { createProductExtractionWorkflow } from "./workflow.js"
import fs from "fs"

async function main() {
  try {
    console.log("🚀 Starting product extraction workflow...")

    const specificUrls = process.argv[2]
      ? JSON.parse(fs.readFileSync(process.argv[2], "utf-8"))
      : null

    const workflow = await createProductExtractionWorkflow(specificUrls)
    console.log("Workflow created, invoking...")

    const result = await workflow.invoke({
      crawledPages: [],
      products: [],
      failedPages: [],
    })

    if (!result || typeof result !== "object") {
      throw new Error(`Invalid workflow result: ${JSON.stringify(result)}`)
    }

    // Safely access products and failed pages
    const products = Array.isArray(result.products) ? result.products : []
    const failedPages = Array.isArray(result.failedPages)
      ? result.failedPages
      : []

    // Save results
    fs.writeFileSync(
      "extracted_products.json",
      JSON.stringify(products, null, 2)
    )

    // Save failed URLs for later processing
    if (failedPages.length > 0) {
      fs.writeFileSync(
        "failed_pages.json",
        JSON.stringify(failedPages, null, 2)
      )
      console.log(
        `⚠️ ${failedPages.length} pages failed to process. See failed_pages.json`
      )
    }

    console.log(`✨ Extracted ${products.length} products`)
  } catch (error) {
    console.error("❌ Workflow failed:", error)
    console.error("Stack trace:", error.stack)
    process.exit(1)
  }
}

main()
