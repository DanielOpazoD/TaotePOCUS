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

| Variable                     | Required | Default                 | Notes                                               |
| ---------------------------- | -------- | ----------------------- | --------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`       | no       | `http://localhost:3000` | Used by sitemap.xml, robots.txt, OpenGraph metadata |
| `NEXT_PUBLIC_ADMIN_EMAIL`    | no       | `admin@taote.pocus`     | Demo admin email. **Replace before production.**    |
| `NEXT_PUBLIC_ADMIN_PASSWORD` | no       | `admin123`              | Demo admin password. **Replace before production.** |

Copy `.env.example` to `.env.local` and edit.

> ⚠️ Anything starting with `NEXT_PUBLIC_` is **bundled into the client**. Never put real secrets there. The admin credentials above are intentionally public — this is a mock auth for the demo. Real auth comes from Firebase / Auth.js / your provider.

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
