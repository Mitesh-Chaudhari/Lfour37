/** Slim product select for listing cards — avoids heavy JSONB and full variant rows. */
export const LISTING_PRODUCT_SELECT = `
  id,
  name,
  slug,
  price,
  compare_price,
  images,
  is_featured,
  is_new_arrival,
  is_trending,
  average_rating,
  review_count,
  variants:product_variants(stock, is_active)
`
