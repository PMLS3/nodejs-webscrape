import { StateGraph, START, END } from "@langchain/langgraph"
import { loadDocumentsNode } from "../nodes/loadDocumentsNode.js"
import { extractProductsNode } from "../nodes/extractProductsNode.js"
import { RunnableSequence } from "@langchain/core/runnables"

// Create and export the graph
export const productCrawlerGraph = new StateGraph()
  .addNode("loadDocuments", loadDocumentsNode)
  .addNode("extractProducts", extractProductsNode)
  .addEdge(START, "loadDocuments")
  .addEdge("loadDocuments", "extractProducts")
  .addEdge("extractProducts", END)
  .compile()
