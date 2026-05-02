// Next.js 16 edge proxy (was `middleware.ts` before the convention
// rename). Clerk's middleware sets up the auth context for every
// request — without it, calling `auth()` from `@clerk/nextjs/server`
// inside Server Actions returns an empty session and admin actions
// fall through to `auth_required`.
//
// Conditional shape: when the publishable key is missing (CI, fresh
// clone, any deploy that hasn't installed the Clerk Netlify
// extension), the export is a no-op `NextResponse.next()`. The
// legacy HMAC-cookie auth path stays available because nothing
// requires the Clerk handler to run — `lib/server/session.ts`
// branches separately.
//
// We export the Clerk middleware DIRECTLY (not wrapped) per Clerk's
// Next.js quickstart. Wrapping it in another function and forwarding
// the request manually breaks the `NextFetchEvent` contract Clerk
// expects in its second argument and the modal SignIn component
// silently fails to mount.

import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

const HAS_CLERK_KEY = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

const noop = (_req: NextRequest) => NextResponse.next();

// We don't `auth.protect()` any route here. The catalog is fully
// public (the unauth users see grids and modals just fine — the data
// is read-only). Admin gating happens at the Server Action level
// (`lib/server/session.ts > requireAdmin`) so the boundary is one
// thing, in one place. The proxy just makes `auth()` available.
export default HAS_CLERK_KEY ? clerkMiddleware() : noop;

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
