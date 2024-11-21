import { z } from "zod"

export const WooCommerceProductSchema = z.object({
  name: z.string(),
  type: z.string().default("simple"),
  status: z.string().default("publish"),
  featured: z.boolean().default(false),
  description: z.string(),
  short_description: z.string().optional(),
  sku: z.string().optional(),
  price: z.string(), // WooCommerce expects price as string
  regular_price: z.string(),
  sale_price: z.string().optional(),
  stock_status: z
    .enum(["instock", "outofstock", "onbackorder"])
    .default("instock"),
  categories: z
    .array(
      z.object({
        name: z.string(),
      })
    )
    .optional(),
  images: z
    .array(
      z.object({
        src: z.string(),
        alt: z.string().optional(),
      })
    )
    .optional(),
  attributes: z
    .array(
      z.object({
        name: z.string(),
        options: z.array(z.string()),
        visible: z.boolean().default(true),
        variation: z.boolean().default(false),
      })
    )
    .optional(),
})

// export type WooCommerceProduct = z.infer<typeof WooCommerceProductSchema>
