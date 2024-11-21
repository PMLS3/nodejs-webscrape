import dotenv from "dotenv"
import { productCrawlerGraph } from "./graphs/productCrawlerGraph.js"

dotenv.config()

async function main() {
  const initialState = {
    url: "https://www.pvpower.co.za/", // Replace with your target URL
  }

  try {
    const finalState = await productCrawlerGraph.invoke(initialState)
    console.log("Extracted Products:", finalState.products)
  } catch (error) {
    console.error("Error running product crawler:", error)
  }
}

main()
