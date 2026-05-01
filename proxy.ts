// Next.js 16 edge proxy (was `middleware.ts` before the convention
// rename). Runs on every request that matches `config.matcher` before
// any route handler. We use it to plumb Clerk's auth context into
// Server Actions — without `clerkMiddleware()`, calling `auth()` from
// `@clerk/nextjs/server` returns an empty session, and every admin
// Server Action falls through to `auth_required`.
//
// Conditional shape: when the publishable key is missing (CI, fresh
// clone, any deploy that hasn't installed the Clerk Netlify
// extension), we fall through to a no-op `NextResponse.next()`. This
// keeps the legacy HMAC-cookie auth path working unchanged. The
// import of `@clerk/nextjs/server` is unconditional because static
// analyzers / Next's edge runtime resolve it at build time anyway —
// the runtime cost is paid only when the wrapper is invoked.

import { NextResponse, type NextRequest } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";

const HAS_CLERK_KEY = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

// We don't `auth.protect()` any route here. The catalog is fully
// public (the unauth users see grids and modals just fine — the data
// is read-only). Admin gating happens at the Server Action level
// (`lib/server/session.ts > requireAdmin`) so the boundary is one
// thing, in one place. The proxy just makes `auth()` available.
const clerkHandler = HAS_CLERK_KEY ? clerkMiddleware() : null;

export default function proxy(req: NextRequest) {
  if (clerkHandler) return clerkHandler(req, {} as never);
  return NextResponse.next();
}

export const config = {
  // Matcher pattern recommended by Clerk's Next.js Quickstart. Runs
  // on every page route + every API/tRPC route, but skips Next.js
  // internals and static asset extensions so we don't waste cycles on
  // JS/CSS/font fetches.
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
