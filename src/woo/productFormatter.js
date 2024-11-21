export const formatProduct = (product) => {
  // Helper function to clean and format price
  const formatPrice = (price) => {
    if (!price) return ""
    return typeof price === "string" ? price : price.toString()
  }

  // Format specifications into a more readable format
  const formatSpecifications = (specs) => {
    const formatted = {}
    if (specs.technical && specs.technical.length > 0) {
      formatted.technical = specs.technical
    }
    if (specs.features && specs.features.length > 0) {
      formatted.features = specs.features
    }
    if (specs.additional && Object.keys(specs.additional).length > 0) {
      formatted.additional = specs.additional
    }
    return formatted
  }

  // Base product data that matches WooCommerce product API
  const formattedProduct = {
    name: product.name,
    type: "simple",
    regular_price:
      formatPrice(product.price?.regular) ||
      formatPrice(product.price?.current),
    sale_price: product.price?.sale ? formatPrice(product.price.sale) : "",
    description: product.description || "",
    short_description: product.short_description || "",
    categories:
      product.categories?.map((cat) => ({
        name: cat,
      })) || [],
    tags:
      product.tags?.map((tag) => ({
        name: tag,
      })) || [],
    images:
      product.images?.map((img) => ({
        src: img.src,
        alt: img.alt || "",
      })) || [],
    sku: product.sku,
    stock_status: "instock", // Set all products to instock as requested
    attributes: [
      {
        name: "Brand",
        visible: true,
        options: [product.brand],
      },
    ],
    meta_data: [
      // Store all additional data as meta
      {
        key: "specifications",
        value: formatSpecifications(product.specifications || {}),
      },
      {
        key: "documents",
        value: product.documents || {},
      },
    ],
  }

  // Add any technical specifications as attributes if they exist
  if (product.specifications?.technical?.length > 0) {
    formattedProduct.attributes.push({
      name: "Technical Specifications",
      visible: true,
      options: product.specifications.technical,
    })
  }

  // Add any features as attributes if they exist
  if (product.specifications?.features?.length > 0) {
    formattedProduct.attributes.push({
      name: "Features",
      visible: true,
      options: product.specifications.features,
    })
  }

  // Add any additional specifications to meta_data
  if (
    product.specifications?.additional &&
    Object.keys(product.specifications.additional).length > 0
  ) {
    formattedProduct.meta_data.push({
      key: "additional_specifications",
      value: product.specifications.additional,
    })
  }

  // Add price history to meta_data if it exists
  if (product.price) {
    formattedProduct.meta_data.push({
      key: "price_history",
      value: {
        regular: product.price.regular,
        current: product.price.current,
        sale: product.price.sale,
      },
    })
  }

  // Store original stock status in meta_data
  formattedProduct.meta_data.push({
    key: "original_stock_status",
    value: product.stock_status,
  })

  return formattedProduct
}
