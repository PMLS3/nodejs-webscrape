import fs from "fs"
import path from "path"
import { ProductProcessorNode } from "./nodes/productProcessor.js"

async function processFailedPages() {
  try {
    // Check if failed_pages.json exists
    if (
      !fs.existsSync(
        path.join(__dirname, `../products/${process.env.PRODUCT}_fail.json`)
      )
    ) {
      console.log("❌ No failed pages file found")
      return
    }

    // Read failed pages
    const failedPages = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, `../products/${process.env.PRODUCT}_fail.json`),
        "utf8"
      )
    )
    if (!failedPages.length) {
      console.log("✨ No failed pages to process")
      return
    }

    console.log(`🔄 Retrying ${failedPages.length} failed pages...`)

    const productProcessor = new ProductProcessorNode()
    const successfulProducts = []
    const stillFailed = []
    const batchSize = 2

    // Process in batches
    for (let i = 0; i < failedPages.length; i += batchSize) {
      const batch = failedPages.slice(i, i + batchSize)
      console.log(
        `Processing batch ${i / batchSize + 1}/${Math.ceil(
          failedPages.length / batchSize
        )}`
      )

      const batchResults = await Promise.all(
        batch.map(async (doc) => {
          try {
            const result = await productProcessor.process({
              pageContent: doc.pageContent,
              url: doc.url,
              metadata: doc.metadata,
            })

            if (result) {
              return { success: true, data: result }
            } else {
              return { success: false, doc }
            }
          } catch (error) {
            console.error(`Failed to process ${doc.url}:`, error)
            return { success: false, doc }
          }
        })
      )

      // Separate successful and failed results
      batchResults.forEach((result) => {
        if (result.success) {
          successfulProducts.push(result.data)
        } else {
          stillFailed.push(result.doc)
        }
      })

      // Add delay between batches if not the last batch
      if (i + batchSize < failedPages.length) {
        console.log("⏳ Waiting 90 seconds before next batch...")
        await new Promise((resolve) => setTimeout(resolve, 90000))
      }
    }

    // Update existing products file with new successful products
    if (successfulProducts.length > 0) {
      let existingProducts = []
      if (fs.existsSync("extracted_products.json")) {
        existingProducts = JSON.parse(
          fs.readFileSync("extracted_products.json", "utf8")
        )
      }

      const updatedProducts = [...existingProducts, ...successfulProducts]
      fs.writeFileSync(
        "extracted_products.json",
        JSON.stringify(updatedProducts, null, 2)
      )
    }

    // Update failed_pages.json with remaining failed pages
    if (stillFailed.length > 0) {
      fs.writeFileSync(
        "failed_pages.json",
        JSON.stringify(stillFailed, null, 2)
      )
    } else {
      // Remove failed_pages.json if all pages were processed successfully
      fs.unlinkSync("failed_pages.json")
    }

    console.log("\n📊 Retry Results:")
    console.log(`✅ Successfully processed: ${successfulProducts.length}`)
    console.log(`❌ Still failed: ${stillFailed.length}`)
  } catch (error) {
    console.error("❌ Error processing failed pages:", error)
    console.error("Stack trace:", error.stack)
    process.exit(1)
  }
}

// Run the retry process
processFailedPages()

export { processFailedPages }
