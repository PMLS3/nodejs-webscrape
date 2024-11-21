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
      const result = await this._processPage(page, url)

      if (result) {
        if (result.links) {
          // This was a category page, process the product links
          console.log(
            `🔍 Processing ${result.links.length} product links from category page`
          )
          for (const link of result.links) {
            if (
              this.visited.size < this.options.maxPages &&
              this._isSameDomain(url, link)
            ) {
              await this._crawlPage(browser, link, depth + 1, documents)
            }
          }
        } else {
          // This was a product page
          console.log(`✅ Successfully processed product page: ${url}`)
          documents.push(result)
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
      // Wait for the main product content instead of WooCommerce specific selector
      await page.waitForSelector(".col-md-12", { timeout: 5000 })

      // Extract the product content
      const content = await page.evaluate(() => {
        // Get the main product content div
        const productDiv = document.querySelector(".col-md-12")

        // Check if this is a product page by looking for specific elements
        const hasProductElements =
          document.querySelector('script[type="application/ld+json"]') &&
          document.querySelector("h1")

        if (!hasProductElements) {
          // This might be a category page, get all product links
          const links = Array.from(document.querySelectorAll('a[href*="/pi"]'))
            .map((a) => a.href)
            .filter((href) => href.includes("/pi"))
          return { isProductPage: false, links }
        }

        return {
          isProductPage: true,
          pageContent: productDiv.innerHTML,
          url: window.location.href,
          title: document.querySelector("h1")?.textContent.trim(),
        }
      })

      if (content.isProductPage) {
        if (this.options.debug) {
          console.log(`Processed product page: ${url}`)
        }
        return {
          pageContent: content.pageContent,
          url: content.url,
          title: content.title,
        }
      } else {
        // Process the links found on category pages
        if (content.links && content.links.length > 0) {
          console.log(
            `Found ${content.links.length} product links on category page`
          )
          // Return null but process the links in _crawlPage
          return { links: content.links }
        }
      }

      return null
    } catch (error) {
      console.error(`Error processing ${url}:`, error)
      return null
    }
  }

  async crawlSinglePage(url) {
    const browser = await puppeteer.launch({
      headless: false,
    })

    try {
      console.log(`Crawling specific URL: ${url}`)
      const page = await browser.newPage()

      // Navigate to the URL and wait for network to be idle
      await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 })

      // Wait for any of these common product page selectors
      await Promise.race([
        page.waitForSelector(".product-content", { timeout: 5000 }),
        page.waitForSelector(".product-summary", { timeout: 5000 }),
        page.waitForSelector(".summary", { timeout: 5000 }),
        page.waitForSelector(".woocommerce-product-gallery", { timeout: 5000 }),
      ]).catch(() => console.log("Warning: Common product selectors not found"))

      // Get the entire page content instead of looking for specific divs
      const content = await page.evaluate(() => {
        return {
          pageContent: document.documentElement.innerHTML,
          title:
            document.querySelector("h1")?.textContent?.trim() ||
            document.querySelector(".product_title")?.textContent?.trim(),
          url: window.location.href,
        }
      })

      // Take a screenshot for debugging (optional)
      await page.screenshot({
        path: `debug_${new URL(url).pathname.split("/").pop()}.png`,
      })

      return {
        url,
        pageContent: content.pageContent,
        metadata: {
          title: content.title,
        },
      }
    } catch (error) {
      console.error(`Failed to crawl ${url}:`, error)
      return null
    } finally {
      await browser.close()
    }
  }
}

export default PuppeteerCrawler
