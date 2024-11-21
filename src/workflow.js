import { StateGraph } from "@langchain/langgraph"
import { ProductProcessorNode } from "./nodes/productProcessor.js"
import PuppeteerCrawler from "./puppeteerCrawler.js"

export async function createProductExtractionWorkflow(specificUrls = null) {
  // Initialize components
  const crawler = new PuppeteerCrawler({
    maxPages: 50,
    maxDepth: 7,
    includePaths: [],
    excludePaths: [],
    headless: false,
  })

  const productProcessor = new ProductProcessorNode()

  // Create workflow graph with initial state
  const workflow = new StateGraph({
    channels: {
      crawledPages: { value: (a = [], b) => [...(a || []), ...(b || [])] },
      products: { value: (a = [], b) => [...(a || []), ...(b || [])] },
      failedPages: { value: (a = [], b) => [...(a || []), ...(b || [])] },
    },
  })

  // Add nodes
  workflow
    .addNode("crawl", async () => {
      console.log("🕷️ Starting web crawler...")
      let docs

      if (specificUrls) {
        console.log(`Crawling ${specificUrls.length} specific URLs...`)
        docs = []
        for (const url of specificUrls) {
          const doc = await crawler.crawlSinglePage(url)
          if (doc) docs.push(doc)
          await new Promise((resolve) => setTimeout(resolve, 2000))
        }
      } else {
        docs = await crawler.crawl("https://www.csisolar.com/inverter/")
      }

      return { crawledPages: docs.filter(Boolean) } // Filter out any null results
    })
    .addNode("process", async (state) => {
      if (!state.crawledPages || !Array.isArray(state.crawledPages)) {
        console.error("Invalid state:", state)
        return { products: [], failedPages: [] }
      }

      console.log(`📦 Processing ${state.crawledPages.length} pages...`)
      const products = []
      const failed = []
      const batchSize = 3 // Process 3 pages at a time

      // Process pages in batches
      for (let i = 0; i < state.crawledPages.length; i += batchSize) {
        const batch = state.crawledPages.slice(i, i + batchSize)
        console.log(
          `Processing batch ${i / batchSize + 1}/${Math.ceil(
            state.crawledPages.length / batchSize
          )}`
        )

        const batchResults = await Promise.all(
          batch.map(async (doc) => {
            if (!doc || !doc.url) {
              console.error("❌ Invalid document:", doc)
              return { success: false, doc }
            }

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
            products.push(result.data)
          } else {
            failed.push(result.doc)
          }
        })

        // Add delay between batches if not the last batch
        if (i + batchSize < state.crawledPages.length) {
          console.log("⏳ Waiting 90 seconds before next batch...")
          await new Promise((resolve) => setTimeout(resolve, 90000))
        }
      }

      console.log(`✨ Found ${products.length} valid products`)
      console.log(`⚠️ Failed to process ${failed.length} pages`)

      return {
        products,
        failedPages: failed,
      }
    })

  // Define edges
  workflow
    .addEdge("__start__", "crawl")
    .addEdge("crawl", "process")
    .addEdge("process", "__end__")

  // Compile with config
  return workflow.compile()
}
