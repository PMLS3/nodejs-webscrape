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

    const browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-web-security",
      ],
      ignoreHTTPSErrors: true,
    })
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
      await page.setDefaultNavigationTimeout(30000)
      await page.setDefaultTimeout(30000)

      // Enable request interception
      await page.setRequestInterception(true)

      // Handle request interception
      page.on("request", (request) => {
        // Block unnecessary resources to speed up loading
        const blockedResourceTypes = [
          "image",
          "media",
          "font",
          "texttrack",
          "object",
          "beacon",
          "csp_report",
          "imageset",
        ]

        if (
          blockedResourceTypes.includes(request.resourceType()) ||
          request.url().includes("google-analytics") ||
          request.url().includes("googletagmanager") ||
          request.url().includes("facebook")
        ) {
          request.abort()
        } else {
          request.continue()
        }
      })

      try {
        await page.goto(url, {
          waitUntil: ["networkidle0", "domcontentloaded"],
          timeout: 30000,
        })

        // Wait for key elements with retry
        let retries = 3
        let contentFound = false

        while (retries > 0 && !contentFound) {
          try {
            await page.waitForSelector(".entry-content-wrapper", {
              timeout: 5000,
            })
            contentFound = true

            // Log the page HTML for debugging
            const html = await page.content()
            console.log("Page HTML:", html.slice(0, 500) + "...")

            // Check if we're getting redirected
            const currentUrl = page.url()
            console.log("Current URL:", currentUrl)
            if (currentUrl !== url) {
              console.log("Redirected from", url, "to", currentUrl)
            }
          } catch (error) {
            console.log(`Retry ${4 - retries}/3: Waiting for content...`)
            retries--
            if (retries === 0) {
              throw error
            }
            await page.reload({
              waitUntil: ["networkidle0", "domcontentloaded"],
            })
          }
        }
      } catch (error) {
        console.error("Navigation/loading error:", error)
        return null
      }

      // Extract the product content
      const content = await page.evaluate(() => {
        // Helper function to safely get text content
        const getTextContent = (element) => {
          try {
            return element?.textContent?.trim() || ""
          } catch (e) {
            console.log("Error getting text content:", e)
            return ""
          }
        }

        // Get the main product content div
        const contentWrapper = document.querySelector(".entry-content-wrapper")
        console.log("Content wrapper found:", !!contentWrapper)

        if (!contentWrapper) {
          console.log("No content wrapper found")
          return { isProductPage: false }
        }

        // Log the content wrapper's HTML
        console.log(
          "Content wrapper HTML:",
          contentWrapper.innerHTML.slice(0, 500) + "..."
        )

        // Check if this is a product page by looking for specific elements
        const iconboxContainers = document.querySelectorAll(
          ".iconbox_content_container"
        )
        const headingTags = document.querySelectorAll(".av-special-heading-tag")
        const productTables = document.querySelectorAll(".avia-data-table")

        // Log all found elements in detail
        console.log("Debug elements:", {
          iconboxContainers: Array.from(iconboxContainers).map((el) => ({
            text: getTextContent(el),
            parentClass: el.parentElement?.className || "no-parent",
            hasTitle: !!el
              .closest(".iconbox_content")
              ?.querySelector(".iconbox_content_title"),
          })),
          headingTags: Array.from(headingTags).map((el) => ({
            text: getTextContent(el),
            parentClass: el.parentElement?.className || "no-parent",
          })),
          productTables: Array.from(productTables).map((table) => ({
            rows: table.rows.length,
            headers: Array.from(table.querySelectorAll("th")).map((th) =>
              getTextContent(th)
            ),
          })),
        })

        // Consider it a product page if we have either features or specifications
        const hasProductElements =
          (iconboxContainers.length > 0 && headingTags.length > 0) ||
          productTables.length > 0

        if (!hasProductElements) {
          console.log("Missing product elements")
          // This might be a category page, get all product links
          const links = Array.from(
            document.querySelectorAll('a[href*="/portfolio-item/"]')
          )
            .map((a) => a.href)
            .filter((href) => href.includes("/portfolio-item/"))
          console.log("Found category links:", links.length)
          return { isProductPage: false, links }
        }

        // Extract product details - use the first relevant heading as title
        const title =
          Array.from(headingTags)
            .map((tag) => getTextContent(tag))
            .find(
              (text) => text && !text.toLowerCase().includes("installation")
            ) || ""

        // Get product features with error handling
        const features = Array.from(iconboxContainers)
          .map((el) => {
            try {
              const featureTitle = getTextContent(
                el
                  .closest(".iconbox_content")
                  ?.querySelector(".iconbox_content_title")
              )
              const featureText = getTextContent(el)
              return featureTitle
                ? `${featureTitle}: ${featureText}`
                : featureText
            } catch (e) {
              console.log("Error processing feature:", e)
              return null
            }
          })
          .filter((text) => text)

        console.log("Found features:", features)

        // Get product specifications if available
        const specs = Array.from(
          document.querySelectorAll(".avia-data-table tr")
        )
          .map((row) => {
            try {
              const cells = Array.from(row.querySelectorAll("td, th"))
              if (cells.length >= 2) {
                return `${getTextContent(cells[0])}: ${getTextContent(
                  cells[1]
                )}`
              }
              return null
            } catch (e) {
              console.log("Error processing spec row:", e)
              return null
            }
          })
          .filter((spec) => spec)

        console.log("Found specifications:", specs)

        return {
          isProductPage: true,
          pageContent: `
            <h1>${title || ""}</h1>
            ${
              features.length > 0
                ? `
            <div class="product-features">
              <h2>Features</h2>
              ${features.join("\n")}
            </div>`
                : ""
            }
            ${
              specs.length > 0
                ? `
            <div class="product-specifications">
              <h2>Specifications</h2>
              ${specs.join("\n")}
            </div>`
                : ""
            }
          `,
          url: window.location.href,
          title: title,
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
      // Extract the product content
      const content = await page.evaluate(() => {
        // Helper function to safely get text content
        const getTextContent = (element) => {
          try {
            return element?.textContent?.trim() || ""
          } catch (e) {
            console.log("Error getting text content:", e)
            return ""
          }
        }

        // Get the main product content div
        const contentWrapper = document.querySelector(".entry-content-wrapper")
        console.log("Content wrapper found:", !!contentWrapper)

        if (!contentWrapper) {
          console.log("No content wrapper found")
          return { isProductPage: false }
        }

        // Log the content wrapper's HTML
        console.log(
          "Content wrapper HTML:",
          contentWrapper.innerHTML.slice(0, 500) + "..."
        )

        // Check if this is a product page by looking for specific elements
        const iconboxContainers = document.querySelectorAll(
          ".iconbox_content_container"
        )
        const headingTags = document.querySelectorAll(".av-special-heading-tag")
        const productTables = document.querySelectorAll(".avia-data-table")

        // Log all found elements in detail
        console.log("Debug elements:", {
          iconboxContainers: Array.from(iconboxContainers).map((el) => ({
            text: getTextContent(el),
            parentClass: el.parentElement?.className || "no-parent",
            hasTitle: !!el
              .closest(".iconbox_content")
              ?.querySelector(".iconbox_content_title"),
          })),
          headingTags: Array.from(headingTags).map((el) => ({
            text: getTextContent(el),
            parentClass: el.parentElement?.className || "no-parent",
          })),
          productTables: Array.from(productTables).map((table) => ({
            rows: table.rows.length,
            headers: Array.from(table.querySelectorAll("th")).map((th) =>
              getTextContent(th)
            ),
          })),
        })

        // Consider it a product page if we have either features or specifications
        const hasProductElements =
          (iconboxContainers.length > 0 && headingTags.length > 0) ||
          productTables.length > 0

        if (!hasProductElements) {
          console.log("Missing product elements")
          // This might be a category page, get all product links
          const links = Array.from(
            document.querySelectorAll('a[href*="/portfolio-item/"]')
          )
            .map((a) => a.href)
            .filter((href) => href.includes("/portfolio-item/"))
          console.log("Found category links:", links.length)
          return { isProductPage: false, links }
        }

        // Extract product details - use the first relevant heading as title
        const title =
          Array.from(headingTags)
            .map((tag) => getTextContent(tag))
            .find(
              (text) => text && !text.toLowerCase().includes("installation")
            ) || ""

        // Get product features with error handling
        const features = Array.from(iconboxContainers)
          .map((el) => {
            try {
              const featureTitle = getTextContent(
                el
                  .closest(".iconbox_content")
                  ?.querySelector(".iconbox_content_title")
              )
              const featureText = getTextContent(el)
              return featureTitle
                ? `${featureTitle}: ${featureText}`
                : featureText
            } catch (e) {
              console.log("Error processing feature:", e)
              return null
            }
          })
          .filter((text) => text)

        console.log("Found features:", features)

        // Get product specifications if available
        const specs = Array.from(
          document.querySelectorAll(".avia-data-table tr")
        )
          .map((row) => {
            try {
              const cells = Array.from(row.querySelectorAll("td, th"))
              if (cells.length >= 2) {
                return `${getTextContent(cells[0])}: ${getTextContent(
                  cells[1]
                )}`
              }
              return null
            } catch (e) {
              console.log("Error processing spec row:", e)
              return null
            }
          })
          .filter((spec) => spec)

        console.log("Found specifications:", specs)

        return {
          isProductPage: true,
          pageContent: `
            <h1>${title || ""}</h1>
            ${
              features.length > 0
                ? `
            <div class="product-features">
              <h2>Features</h2>
              ${features.join("\n")}
            </div>`
                : ""
            }
            ${
              specs.length > 0
                ? `
            <div class="product-specifications">
              <h2>Specifications</h2>
              ${specs.join("\n")}
            </div>`
                : ""
            }
          `,
          url: window.location.href,
          title: title,
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
      // await Promise.race([
      //   // page.waitForSelector(".av-special-heading-tag", { timeout: 5000 }),
      //   // page.waitForSelector(".product-summary", { timeout: 5000 }),
      //   // page.waitForSelector(".summary", { timeout: 5000 }),
      //   // page.waitForSelector(".woocommerce-product-gallery", { timeout: 5000 }),
      // ]).catch(() => console.log("Warning: Common product selectors not found"))

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
