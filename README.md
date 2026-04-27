# Taote POCUS

Atlas público educativo de **POCUS** (Point-of-Care Ultrasound), **ECG**, **casos clínicos** e **infografías**, en español. Pensado para residentes y especialistas.

> **Estado:** prototipo funcional con auth mock y persistencia en `localStorage`. Apto para demos y prueba interna. **No apto para uso clínico real** hasta que se complete la migración a backend con autenticación de servidor.

---

## Contenidos

- [Comandos rápidos](#comandos-rápidos)
- [Stack](#stack)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Variables de entorno](#variables-de-entorno)
- [Rutas](#rutas)
- [Roles y autenticación](#roles-y-autenticación)
- [Convenciones](#convenciones)
- [Testing](#testing)
- [Despliegue](#despliegue)
- [Solución de problemas](#solución-de-problemas)
- [Documentación adicional](#documentación-adicional)

---

## Comandos rápidos

```bash
npm install            # primera vez
npm run dev            # http://localhost:3000
npm run build          # build de producción
npm run start          # sirve el build (después de build)

npm run lint           # ESLint
npm run typecheck      # TypeScript (tsc --noEmit)
npm run format         # Prettier --write
npm run format:check   # Prettier --check (lo que corre CI)

npm test               # Vitest (unit)
npm run test:watch     # Vitest watch
npm run test:coverage  # Vitest con cobertura
npm run test:e2e       # Playwright (build + start + chromium)

npm run analyze        # Bundle analyzer
```

## Stack

- **Next.js 16** App Router, **React 18**, **TypeScript** estricto
- **Vitest** (unit) + **Playwright** (e2e)
- **ESLint** flat config + **Prettier** + **Husky** pre-commit
- **CSS** plano con design tokens (sin Tailwind)
- Persistencia hoy: `localStorage`. Mañana: Firebase / Supabase / etc. (ver [ADR-0001](./docs/adr/0001-mock-auth-with-localstorage.md))

## Estructura del proyecto

```
.
├── app/                  # App Router pages (Next.js)
│   ├── (root files)      # layout, page, error, robots, sitemap, globals.css
│   ├── ecg/              # /ecg
│   ├── cases/            # /cases
│   ├── info/             # /info
│   ├── favoritos/        # /favoritos
│   └── admin/            # /admin
├── components/           # React components (organized by responsibility)
│   ├── App.tsx           # Top-level orchestrator, hydration, modals
│   ├── Sidebar.tsx
│   ├── chrome/           # Header, MobileDrawer, ThemeToggle
│   ├── cards/            # CaseCard, FeaturedRow
│   ├── modals/           # CaseModal, AuthModal, ConfirmDialog
│   ├── cine/             # CineLoop + scenes + PresentationMode
│   └── admin/            # AdminPanel, CaseForm
├── lib/                  # Pure modules (no React)
│   ├── data.ts           # Seed cases, sections, categories, tags
│   ├── types.ts          # Shared domain types
│   ├── repo.ts           # Persistence facade (auth, cases, favs)
│   ├── store.ts          # localStorage adapter w/ defensive read/write
│   ├── url.ts            # URL <-> view-state translation
│   ├── headers.ts        # Page heading derivation
│   ├── env.ts            # Typed env access
│   ├── errors.ts         # AuthError, StorageError, Result<T,E>
│   ├── log.ts            # Logging seam (drop-in for Sentry)
│   └── icons.tsx         # Inline SVG icon set
├── hooks/                # Custom React hooks
│   ├── useViewState.ts   # URL-driven view/filter state
│   └── useFocusTrap.ts   # Modal focus management
├── tests/                # Vitest unit tests
├── e2e/                  # Playwright end-to-end tests
└── docs/                 # Architecture + ADRs
```

## Variables de entorno

Copy `.env.example` to `.env.local` and edit. Every value is optional — the app runs out of the box on the localStorage fallback. Set the Firebase block to activate real auth + persistence; set the Sentry block to activate observability.

| Variable                                                                             | Required                   | Default                          | Activates                     |
| ------------------------------------------------------------------------------------ | -------------------------- | -------------------------------- | ----------------------------- |
| `NEXT_PUBLIC_SITE_URL`                                                               | no                         | `http://localhost:3000`          | Sitemap, robots, OG           |
| `NEXT_PUBLIC_ADMIN_EMAIL` / `NEXT_PUBLIC_ADMIN_PASSWORD`                             | no (demo only)             | `admin@taote.pocus` / `admin123` | Mock-auth admin credentials   |
| `NEXT_PUBLIC_FIREBASE_API_KEY` and 5 siblings (see [`.env.example`](./.env.example)) | all six together           | empty                            | **Firebase Auth + Firestore** |
| `NEXT_PUBLIC_SENTRY_DSN`                                                             | no                         | empty                            | **Sentry** error reporting    |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`                                  | only with DSN, server-only | empty                            | Sentry sourcemap upload       |

> ⚠️ Anything starting with `NEXT_PUBLIC_` is **bundled into the client**. Never put real secrets there. Firebase API keys are public by design — security comes from Firestore Rules, not from secrecy. Sentry DSNs are write-only tokens. Other server-side tokens (`SENTRY_AUTH_TOKEN`) live only in your CI / Netlify env config.

## Activación: Firebase + Sentry + Netlify

The repo ships everything cabled-up but **dormant** behind feature flags. To go from local-only to a real public deploy, you do the cloud-side setup once and paste credentials in. No code changes needed.

### 1. Firebase Auth + Firestore (recommended)

1. **Create the Firebase project**: https://console.firebase.google.com → "Add project". Name it `taote-pocus` or similar.
2. **Enable Email/Password sign-in**: Authentication → Sign-in method → Email/Password → Enable.
3. **Create the admin account**: Authentication → Users → Add user. Use the email you'll set as `NEXT_PUBLIC_ADMIN_EMAIL` and a strong password. This account becomes the admin because of the email match — there's no other gating yet.
4. **Create the Firestore database**: Firestore Database → Create database → Production mode → choose a location near your users (e.g. `southamerica-east1`).
5. **Apply the security rules**: Firestore → Rules tab. The rules below restrict `cases/*` writes to the admin email and let anyone read public content. Paste and publish:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       function isAdmin() {
         return request.auth != null
           && request.auth.token.email == "REPLACE_WITH_ADMIN_EMAIL";
       }
       match /cases/{caseId} {
         allow read: if true;
         allow write: if isAdmin();
       }
       match /favorites/{email} {
         allow read, write: if request.auth != null
           && request.auth.token.email == email;
       }
     }
   }
   ```

6. **Copy the Web SDK config**: Project settings → General → "Your apps" → register a Web app (give it any nickname). Copy the six values from the `firebaseConfig` object.
7. **Paste into env**: drop the six values into `.env.local` (for local dev) or your Netlify env (for production). The next build / dev start picks them up automatically.

Local verification: open the app, log in as the admin, publish a case → reload → it's still there because it lives in Firestore. Try the same with a non-admin email — the Publish button errors out (rules block).

### 2. Sentry (optional but recommended for production)

1. **Create a Sentry account**: https://sentry.io. Free plan is fine.
2. **New project**: choose the **Next.js** platform.
3. **Copy the DSN**: it appears in Project Settings → Client Keys. Looks like `https://abc123@o0.ingest.sentry.io/0`.
4. **Optional — Sourcemap upload**: Settings → Auth Tokens → create a token with `project:write` scope. Note the org slug and project slug from the URL.
5. **Paste into env**: `NEXT_PUBLIC_SENTRY_DSN` (and optionally `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT`).

The SDK initializes only when DSN is set, so leaving it empty is the right answer for local dev.

### 3. Netlify deploy

1. **Connect the repo**: Netlify dashboard → Add new site → Import from Git → pick `TaotePOCUS`.
2. **Build settings**: Netlify auto-detects Next.js. Confirm the values match [`netlify.toml`](./netlify.toml):
   - Build command: `npm run build`
   - Publish directory: `.next`
   - Node version: `20`
3. **Environment variables**: Site settings → Environment variables → paste everything from your `.env.local` (Firebase six, Sentry, site URL set to the production domain).
4. **Plugin**: Netlify automatically installs `@netlify/plugin-nextjs` from `netlify.toml`.
5. **Deploy**: trigger a deploy from the dashboard. After it succeeds, visit `https://<your-site>/robots.txt` and `https://<your-site>/sitemap.xml` to confirm.

Lighthouse and the security headers are validated by CI on every push to `main` (`.github/workflows/ci.yml`).

## Rutas

| Path           | Vista                               |
| -------------- | ----------------------------------- |
| `/`            | Atlas POCUS (homepage)              |
| `/ecg`         | ECG                                 |
| `/cases`       | Casos clínicos                      |
| `/info`        | Infografías                         |
| `/favoritos`   | Colección personal (`noindex`)      |
| `/admin`       | Panel de administración (`noindex`) |
| `/robots.txt`  | Auto-generado                       |
| `/sitemap.xml` | Auto-generado                       |

Todas las páginas son **estáticas** en el build. La interactividad se hidrata en el cliente. Estado de filtros / modales viaja en query params (`?cat=`, `?tags=`, `?q=`, `?caso=`, etc.) — la URL es la fuente de verdad.

## Roles y autenticación

Hay dos roles: `user` y `admin`. La diferencia:

- **`user`** puede guardar favoritos en su navegador.
- **`admin`** ve la pestaña _Administrar_, puede crear/editar/eliminar casos. Las eliminaciones son **soft-delete** con audit trail (papelera) y son reversibles desde el panel.

Sesiones expiran:

- Admin → 8 horas
- User → 30 días

La sesión se re-valida cuando la pestaña recibe foco. Si expiró, se cierra sesión con toast.

> ⚠️ La autenticación actual es **mock**. Un usuario que conozca la implementación puede editar `localStorage` directamente y forjarse rol admin. **Esto se resuelve con backend real** — ver [ADR-0001](./docs/adr/0001-mock-auth-with-localstorage.md).

## Convenciones

- **Lenguaje del código:** identificadores en inglés. Strings de UI en español.
- **TypeScript:** `strict: true`. `any` está prohibido (warning). `unknown` con narrowing es preferido.
- **Errores:** `Result<T,E>` para fallos esperados (write fallido, auth incorrecta). `throw` solo para invariantes rotos.
- **Estado:** la URL es la fuente de verdad para vista y filtros. `useState` solo para estado transient (modales abiertos, sesión hidratada, toasts).
- **Persistencia:** todo va por `repo.*`. Nadie llama `localStorage` directamente fuera de `lib/store.ts`.
- **Logging:** `log.error/warn/info/debug` desde `@/lib/log`. No `console.log` directo en producción.
- **Estilos:** CSS plano con custom properties. Tema oscuro vía `[data-theme="dark"]`. Solo se admite `prefers-reduced-motion` y `prefers-color-scheme`.

## Testing

- **Unit (Vitest, happy-dom):** módulos puros (`lib/url`, `lib/headers`, `lib/repo`, `lib/store`). Cobertura ≥ 80% en `lib/`.
- **E2E (Playwright, chromium):** flujos críticos sobre el build de producción — render del grid, navegación entre secciones, abrir/cerrar modal, login admin/usuario, error de password, deep-links.

Ambos corren en CI ([`.github/workflows/ci.yml`](./.github/workflows/ci.yml)) en cada push y PR a `main`.

## Despliegue

Pensado para **Netlify** (estático con functions opcionales). Build comando: `npm run build`. Output: `.next` (Next maneja el deploy plugin de Netlify).

```bash
# en Netlify build settings:
Build command:    npm run build
Publish directory: .next
Node version:     20
```

Variables de entorno: configurar `NEXT_PUBLIC_SITE_URL` con la URL pública. Ver [Variables de entorno](#variables-de-entorno).

## Solución de problemas

**`next build` falla con error de TypeScript** → corre `npm run typecheck` para ver el detalle. Suele ser un import rotos por reorganización de carpetas.

**Tests Playwright cuelgan en `webServer`** → asegúrate que el puerto 3100 esté libre. El config lo usa para no chocar con el `npm run dev` (3000).

**Modo oscuro parpadea al cargar** → si modificaste `app/layout.tsx`, asegúrate de mantener el script de pre-paint en `<head>` antes de cualquier estilo. Ver el comentario en el archivo.

**Subir un video rebota con "Sin espacio"** → `localStorage` tiene ~5 MB de tope total. La validación rechaza archivos >3 MB para dejar margen. En producción los archivos van a Cloudinary / Supabase Storage; este límite desaparece.

**El admin sigue logueado después de cerrar el navegador** → eso es esperado mientras la sesión no expire (8h para admin). Para invalidarla manualmente: DevTools → Application → Local Storage → borrar `pocus_user`.

## Documentación adicional

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — capas, contratos, flujo de datos
- [`docs/adr/`](./docs/adr/) — Architecture Decision Records
- [`CHANGELOG.md`](./CHANGELOG.md) — historial versionado

## Licencia

[MIT](./LICENSE)
