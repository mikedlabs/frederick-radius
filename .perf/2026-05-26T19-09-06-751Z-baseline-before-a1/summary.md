# Lighthouse audit: baseline-before-a1

Run at 2026-05-26T19:10:44.097Z
Base: http://localhost:3000

| Page | Perf | A11y | Best | SEO | TTFB | LCP | CLS | TBT | FCP |
|---|---|---|---|---|---|---|---|---|---|
| `/now` | 🟡 62 | 🟢 98 | 🟢 93 | 🟢 100 | 2.33 s | 4.60 s | 0.385 | 96 ms | 1.20 s |
| `/browse` | error | error | error | error | error | error | error | error | error |
| `/events` | 🟡 73 | 🟢 97 | 🟢 93 | 🟢 100 | 531 ms | 11.97 s | 0.000 | 135 ms | 1.80 s |
| `/radius` | 🟡 79 | 🟢 96 | 🟢 93 | 🟢 100 | 2 ms | 5.19 s | 0.000 | 126 ms | 1.20 s |
| `/places/carroll-creek-linear-park-frederick` | 🟡 71 | 🟢 100 | 🟡 89 | 🟢 100 | 4 ms | 12.56 s | 0.000 | 115 ms | 1.20 s |

Targets: Perf >= 90, A11y >= 95, BP >= 95, SEO >= 95.
LCP < 2.5s, CLS < 0.1, TBT < 200ms, TTFB < 200ms.

## Failures

- `http://localhost:3000/browse`

```
Runtime error encountered: The page did not paint any content. Please ensure you keep the browser window in the foreground during the load and try again. (NO_FCP)
```
