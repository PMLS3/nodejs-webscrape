import { ChatOpenAI } from "@langchain/openai"
import { HumanMessage } from "@langchain/core/messages"
import { WooCommerceProductSchema } from "../schemas/productSchema.js"

const llm = new ChatOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0,
})

export const extractProductsNode = async (state) => {
  const products = []

  for (const doc of state.documents) {
    const prompt = `
Extract product information from the following text and structure it as a WooCommerce product JSON:
${doc.pageContent}

The JSON should follow this structure:
${JSON.stringify(WooCommerceProductSchema, null, 2)}

Return ONLY the JSON, no additional text.
`

    try {
      const response = await llm.invoke([new HumanMessage(prompt)])
      const product = JSON.parse(response.content)
      products.push(product)
    } catch (error) {
      console.error("Failed to parse product data:", error)
      continue
    }
  }

  return { products }
}
