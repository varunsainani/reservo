import type { MetadataRoute } from "next";

// Keep only the public marketing surface indexable: the landing page ("/") and
// public provider pages ("/p/..."). Everything else is private (dashboard, admin,
// my-bookings, auth) or transient/tokenised (checkout, booking) and must not be
// crawled or indexed.
export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL || "http://localhost:3000";
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/p/"],
      disallow: [
        "/checkout/",
        "/booking/",
        "/dashboard",
        "/admin",
        "/my-bookings",
        "/login",
        "/register",
      ],
    },
    host: base,
  };
}
