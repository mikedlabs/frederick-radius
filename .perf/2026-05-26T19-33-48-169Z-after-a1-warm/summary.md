# Lighthouse audit: after-a1-warm

Run at 2026-05-26T19:35:20.623Z
Base: http://localhost:3000

| Page | Perf | A11y | Best | SEO | TTFB | LCP | CLS | TBT | FCP |
|---|---|---|---|---|---|---|---|---|---|
| `/now` | 🟡 62 | 🟢 98 | 🟢 93 | 🟢 100 | 14 ms | 5.17 s | 0.395 | 70 ms | 1.20 s |
| `/browse` | error | error | error | error | error | error | error | error | error |
| `/events` | 🟡 73 | 🟢 97 | 🟢 93 | 🟢 100 | 884 ms | 9.94 s | 0.000 | 99 ms | 1.80 s |
| `/radius` | 🟡 79 | 🟢 96 | 🟢 93 | 🟢 100 | 2 ms | 5.19 s | 0.000 | 121 ms | 1.20 s |
| `/places/carroll-creek-linear-park-frederick` | 🟡 71 | 🟢 100 | 🟡 89 | 🟢 100 | 5 ms | 14.82 s | 0.000 | 110 ms | 1.20 s |

Targets: Perf >= 90, A11y >= 95, BP >= 95, SEO >= 95.
LCP < 2.5s, CLS < 0.1, TBT < 200ms, TTFB < 200ms.

## Failures

- `http://localhost:3000/browse`

```
Runtime error encountered: The page did not paint any content. Please ensure you keep the browser window in the foreground during the load and try again. (NO_FCP)
```
