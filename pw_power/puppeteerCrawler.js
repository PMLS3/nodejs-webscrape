import puppeteer from "puppeteer"
import TurndownService from "turndown"
import { URL } from "url"

class PuppeteerCrawler {
  constructor(options = {}) {
    this.options = {
      maxPages: options.maxPages || 10,
      maxDepth: options.maxDepth || 3,
      excludePaths: (options.excludePaths || []).map((path) =>
        path.toLowerCase().replace(/^\/+|\/+$/g, "")
      ),
      includePaths: (options.includePaths || []).map((path) =>
        path.toLowerCase().replace(/^\/+|\/+$/g, "")
      ),
      formats: options.formats || ["markdown"],
      debug: options.debug || true,
    }

    if (this.options.debug) {
      console.log("🔧 Crawler initialized with options:", this.options)
    }

    this.visited = new Set()
    this.normalizedVisited = new Set()
    this.turndown = new TurndownService()
    this.pagesProcessed = 0
  }

  async crawl(startUrl) {
    console.log(`🚀 Starting crawler at ${startUrl}`)
    console.log(
      `📋 Config: Max pages: ${this.options.maxPages}, Max depth: ${this.options.maxDepth}`
    )

    const browser = await puppeteer.launch()
    const documents = []

    try {
      await this._crawlPage(browser, startUrl, 0, documents)
      console.log(`\n✅ Crawl complete! Processed ${this.pagesProcessed} pages`)
    } finally {
      await browser.close()
    }

    return documents
  }

  _normalizeUrl(url) {
    try {
      const parsedUrl = new URL(url)
      return `${parsedUrl.origin}${parsedUrl.pathname}`
        .toLowerCase()
        .replace(/\/+$/, "")
    } catch (error) {
      console.error(`Error normalizing URL ${url}:`, error)
      return url
    }
  }

  async _crawlPage(browser, url, depth, documents) {
    const normalizedUrl = this._normalizeUrl(url)

    if (
      depth >= this.options.maxDepth ||
      this.visited.size >= this.options.maxPages ||
      this.visited.has(url) ||
      this.normalizedVisited.has(normalizedUrl)
    ) {
      if (this.options.debug) {
        console.log(`⏭️ Skipping duplicate URL: ${url}`)
      }
      return
    }

    this.visited.add(url)
    this.normalizedVisited.add(normalizedUrl)
    this.pagesProcessed++

    console.log(
      `\n📄 [${this.pagesProcessed}/${this.options.maxPages}] Crawling ${url} (depth: ${depth})`
    )
    const page = await browser.newPage()

    try {
      await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 })

      // Process the page
      const document = await this._processPage(page, url)
      if (document) {
        console.log(`✅ Successfully processed product page: ${url}`)
        documents.push(document)
      }

      // Find links to other product pages
      const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[href*="/product/"]'))
          .map((a) => a.href)
          .filter((href) => href.includes("/product/"))
      })

      // Recursively crawl other product pages
      for (const link of links) {
        if (this._isSameDomain(url, link)) {
          await this._crawlPage(browser, link, depth + 1, documents)
        }
      }
    } catch (error) {
      console.error(`❌ Error crawling ${url}:`, error)
    } finally {
      await page.close()
    }
  }

  _shouldCrawl(url) {
    const pathname = new URL(url).pathname.toLowerCase()

    // If includePaths is specified, ONLY crawl those paths
    if (this.options.includePaths.length > 0) {
      // Allow the root URL only if we're just starting
      if (pathname === "/" && this.visited.size === 0) {
        console.log("✅ Allowing root URL for initial crawl")
        return true
      }

      // Check if the path exactly matches any of the include patterns
      const isIncluded = this.options.includePaths.some((path) => {
        path = path.toLowerCase()
        // Match exact path or path with trailing slash
        return pathname.startsWith(`/${path}`)
      })

      if (!isIncluded) {
        console.log(`⏭️ Skipping ${pathname} (not in included paths)`)
        return false
      }

      console.log(`✅ Including ${pathname} (matches include paths)`)
      return true
    }

    // If no includePaths specified, use excludePaths
    if (this.options.excludePaths.length > 0) {
      const isExcluded = this.options.excludePaths.some((path) =>
        pathname.includes(path.toLowerCase())
      )

      if (isExcluded) {
        console.log(`⏭️ Skipping ${pathname} (matches exclude paths)`)
        return false
      }
    }

    console.log(`✅ Including ${pathname} (no path restrictions)`)
    return true
  }

  _isSameDomain(url1, url2) {
    return new URL(url1).hostname === new URL(url2).hostname
  }

  async _processPage(page, url) {
    try {
      await page.waitForSelector(".product-details-wrapper", { timeout: 5000 })

      // Click on Additional Information tab to load that content
      await page.click("#tab-title-additional_information")
      await page.waitForSelector("#tab-additional_information", {
        visible: true,
      })

      // Extract only the relevant product HTML sections
      const content = await page.evaluate(() => {
        // Get the main product sections
        const productWrapper = document.querySelector(
          ".product-details-wrapper"
        )
        const gallerySection = document.querySelector(
          ".woocommerce-product-gallery"
        )
        const summarySection = document.querySelector(".summary")
        const tabsSection = document.querySelector(".woocommerce-tabs")

        // Create a new div to hold our cleaned content
        const cleanContent = document.createElement("div")

        if (gallerySection)
          cleanContent.appendChild(gallerySection.cloneNode(true))
        if (summarySection)
          cleanContent.appendChild(summarySection.cloneNode(true))
        if (tabsSection) cleanContent.appendChild(tabsSection.cloneNode(true))

        // Remove any related products sections
        const relatedProducts = cleanContent.querySelectorAll(
          ".related, .up-sells, .cross-sells"
        )
        relatedProducts.forEach((section) => section.remove())

        return {
          pageContent: cleanContent.innerHTML,
          url: window.location.href,
          title: document.title,
        }
      })

      if (this.options.debug) {
        console.log(`Processed ${url}`)
      }

      return {
        pageContent: content.pageContent,
        url: content.url,
        title: content.title,
      }
    } catch (error) {
      console.error(`Error processing ${url}:`, error)
      return null
    }
  }
}

export default PuppeteerCrawler
