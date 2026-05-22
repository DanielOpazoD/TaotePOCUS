#!/usr/bin/env node
// Smoke test: fetch the production URL + assert every required
// security header is present + matches the documented value.
//
// Usage:
//   node scripts/verify-security-headers.mjs https://taote-pocus.netlify.app
//
// Exit code 0 = all headers OK. Non-zero = at least one mismatch
// (printed to stderr).
//
// Why this exists: the security headers are declared in TWO places
// (`next.config.mjs > securityHeaders` for Next-rendered responses
// + `netlify.toml > [[headers]]` for CDN-served static assets).
// Drift between them is invisible to local typecheck / lint. The
// script catches it after a deploy by hitting the live URL.
//
// Pair with `docs/security.md` audit log — if this script ever
// fails post-deploy, the deploy is rolled back + the doc updated.

const REQUIRED_HEADERS = [
  {
    name: "x-frame-options",
    expected: "DENY",
    note: "Click-jacking defense (belt-and-suspenders with CSP frame-ancestors).",
  },
  {
    name: "x-content-type-options",
    expected: "nosniff",
    note: "No MIME confusion.",
  },
  {
    name: "referrer-policy",
    expected: "strict-origin-when-cross-origin",
    note: "Don't leak paths to third parties.",
  },
  {
    name: "permissions-policy",
    expectedIncludes: ["camera=()", "microphone=()", "geolocation=()", "interest-cohort=()"],
    note: "No device permissions + no FLoC.",
  },
  {
    name: "strict-transport-security",
    expectedIncludes: ["max-age=", "includeSubDomains", "preload"],
    note: "HSTS — production only.",
  },
  {
    name: "cross-origin-opener-policy",
    expected: "same-origin-allow-popups",
    note: "Strict opener isolation except for Clerk SSO popups.",
  },
  {
    name: "cross-origin-resource-policy",
    expected: "same-origin",
    note: "No cross-origin reads of our resources.",
  },
  {
    name: "content-security-policy",
    expectedIncludes: [
      "default-src 'self'",
      "script-src",
      "style-src",
      "frame-ancestors 'none'",
      "report-uri /api/security/csp-report",
    ],
    note: "Strict CSP with violation reporting.",
  },
];

const url = process.argv[2];
if (!url) {
  console.error("Usage: node scripts/verify-security-headers.mjs <url>");
  process.exit(2);
}

try {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    console.error(`✗ Fetch failed: HTTP ${res.status}`);
    process.exit(1);
  }
  let failures = 0;
  for (const check of REQUIRED_HEADERS) {
    const value = res.headers.get(check.name);
    if (!value) {
      console.error(`✗ Missing header: ${check.name}`);
      console.error(`  (${check.note})`);
      failures++;
      continue;
    }
    if (check.expected !== undefined) {
      if (value !== check.expected) {
        console.error(`✗ ${check.name} mismatch`);
        console.error(`  expected: ${check.expected}`);
        console.error(`  actual:   ${value}`);
        failures++;
        continue;
      }
    }
    if (check.expectedIncludes) {
      const missing = check.expectedIncludes.filter((token) => !value.includes(token));
      if (missing.length > 0) {
        console.error(`✗ ${check.name} missing tokens: ${missing.join(", ")}`);
        console.error(`  actual: ${value}`);
        failures++;
        continue;
      }
    }
    console.log(`✓ ${check.name}`);
  }
  if (failures > 0) {
    console.error(`\n${failures} header(s) failed verification.`);
    process.exit(1);
  }
  console.log(`\n✓ All ${REQUIRED_HEADERS.length} required headers OK at ${url}`);
} catch (err) {
  console.error(`✗ Verification failed: ${err.message}`);
  process.exit(1);
}
