# Visual regression baselines

These PNGs are baselines for `e2e/visual.spec.ts`. They are
**platform-dependent**: the file naming pattern `<name>-chromium-<os>.png`
exists because Chromium renders fonts and anti-aliasing differently on
macOS vs Linux vs Windows.

## Regenerating

After an intentional design change:

```bash
# On the platform you want to regenerate (typically the CI platform):
npm run test:e2e -- --update-snapshots e2e/visual.spec.ts
```

Commit the resulting `*-chromium-<os>.png` files.

## CI considerations

CI runs on Ubuntu (`runs-on: ubuntu-latest`). Linux baselines need to be
generated there. The simplest workflow:

1. The first time visual regression lands in CI, the test will fail
   because no Linux baseline exists.
2. Download the actual screenshots from the CI artifacts.
3. Commit them as `<name>-chromium-linux.png` next to the macOS files.
4. Subsequent runs compare against the matching platform baseline.

If you only develop on macOS and rely on local runs, the macOS
baselines are enough.
