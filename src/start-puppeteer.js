import PuppeteerCrawler from "./puppeteerCrawler.js"
import fs from "fs"

const params = {
  formats: ["markdown"],
  excludePaths: ["blog/"],
  includePaths: ["product/"],
  maxPages: 100,
  maxDepth: 3,
}

const crawler = new PuppeteerCrawler(params)

console.log("Loading documents...")
const docs = await crawler.crawl("https://www.pvpower.co.za/")

// write to json file
fs.writeFileSync("docs.json", JSON.stringify(docs, null, 2))

console.log(docs)
