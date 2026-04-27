# AEO Optimizer

A Shopify app that helps merchants improve their visibility in AI-driven search and answer engines (ChatGPT, Claude, Perplexity, Gemini, SearchGPT).

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.19-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Built for Shopify](https://img.shields.io/badge/Built%20for-Shopify-95BF47?logo=shopify&logoColor=white)](https://shopify.dev/)

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Available Scripts](#available-scripts)
- [Project Structure](#project-structure)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Overview

Answer Engine Optimization (AEO) is the practice of structuring storefront content so that large language models can discover, understand, and cite it accurately. AEO Optimizer surfaces the metrics and tooling Shopify merchants need to do that, directly inside the Shopify Admin.

The app is delivered as an embedded Shopify Admin app plus a theme app extension that ships a lightweight referrer tracker to the storefront.

## Features

- **llms.txt generator** &mdash; Builds a standards-aligned [`llms.txt`](https://llmstxt.org/) manifest from the merchant's collections, products, and pages, served from the storefront via Shopify's app proxy at `/a/llms-txt`.
- **Content score audit** &mdash; Scores product descriptions and pages on clarity, structure, crawlability, and AEO signals, and surfaces actionable issues in a Polaris-styled report.
- **AI referrer analytics** &mdash; A theme app embed pings the app proxy on storefront page views; the server classifies the referrer (ChatGPT, Claude, Perplexity, Gemini, SearchGPT) and stores daily aggregates for the in-admin chart.
- **Shopify-native UX** &mdash; Built on Polaris web components and App Bridge for an embedded experience that matches the rest of the Shopify Admin.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [React Router v7](https://reactrouter.com/) (server-rendered) |
| Language | TypeScript |
| Shopify SDK | [`@shopify/shopify-app-react-router`](https://shopify.dev/docs/api/shopify-app-react-router), App Bridge, Polaris web components |
| ORM / DB | [Prisma](https://www.prisma.io/) with SQLite (dev); swap the datasource for Postgres/MySQL in production |
| Charts | [Recharts](https://recharts.org/) |
| Build | [Vite](https://vite.dev/) |
| Tooling | Shopify CLI, ESLint, Prettier, pnpm workspaces |

## Prerequisites

- **Node.js** `>=20.19 <22` or `>=22.12`
- **pnpm** (recommended; the repository ships a `pnpm-lock.yaml` and uses pnpm workspaces)
- **[Shopify CLI](https://shopify.dev/docs/apps/tools/cli/installation)**
- A [Shopify Partner account](https://partners.shopify.com/signup) and a development store

## Getting Started

### 1. Install dependencies

```sh
pnpm install
```

### 2. Link the app to your Partner account

```sh
pnpm shopify app config link
```

This generates a local `shopify.app.<name>.toml` and connects the project to your Partner-dashboard app.

### 3. Initialize the database

```sh
pnpm setup
```

Runs `prisma generate` and applies migrations to the local SQLite database at `prisma/dev.sqlite`.

### 4. Start the dev server

```sh
pnpm dev
```

The Shopify CLI will provision a tunnel, inject environment variables, and print an install URL. Press `P` to open it; once the app is installed on your dev store, you'll land in the embedded admin.

## Available Scripts

| Script | Description |
|---|---|
| `pnpm dev` | Start the Shopify CLI dev server with tunneling and live reload. |
| `pnpm build` | Compile the React Router app for production. |
| `pnpm start` | Serve the production build. |
| `pnpm setup` | Generate the Prisma client and apply pending migrations. |
| `pnpm typecheck` | Generate React Router types and run `tsc --noEmit`. |
| `pnpm lint` | Run ESLint across the project. |
| `pnpm deploy` | Push app config and extensions to Shopify. |
| `pnpm graphql-codegen` | Regenerate typed Admin GraphQL operations. |

## Project Structure

```
aeo-optimizer/
├── app/
│   ├── components/                  # Shared React components (charts, etc.)
│   ├── lib/                         # Pure helpers + server-only data utilities
│   │   ├── ai-referrer-classify.server.ts
│   │   ├── ai-referrer-stats.server.ts
│   │   ├── content-score-helpers.ts
│   │   └── referrer-traffic.query.server.ts
│   ├── routes/                      # React Router routes
│   │   ├── app._index.tsx           # Embedded admin home
│   │   ├── app.crawlability.tsx     # Content score report
│   │   ├── app.generate.tsx         # llms.txt generator
│   │   ├── apps.proxy.ai-ref.tsx    # App proxy: AI referrer ingest
│   │   └── proxy.tsx                # App proxy: serves llms.txt
│   ├── services/
│   │   └── content-score.server.ts  # Content audit engine
│   ├── db.server.ts                 # Prisma client
│   └── shopify.server.ts            # Shopify app instance & auth
├── extensions/
│   └── aeo-analytics-embed/         # Theme app extension (referrer tracker)
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── shopify.app.toml                 # App-level config (scopes, webhooks, proxy)
└── react-router.config.ts           # React Router build config
```

## Configuration

### Access scopes

Declared in `shopify.app.toml`:

```
read_products, read_content, read_online_store_pages,
write_products, write_metaobjects, write_metaobject_definitions,
write_app_proxy
```

### App proxies

| Path on storefront | Internal route | Purpose |
|---|---|---|
| `/a/llms-txt` | `app/routes/proxy.tsx` | Public `llms.txt` served from the storefront origin. |
| `/apps/aeo-ai-ref` | `app/routes/apps.proxy.ai-ref.tsx` | Beacon endpoint for AI referrer tracking. |

### Webhooks

App-specific webhooks are declared in `shopify.app.toml` and synchronized on `pnpm deploy`:

- `app/uninstalled`
- `app/scopes_update`

### Database

The default datasource is SQLite, intended for development. For production deployments, update `prisma/schema.prisma` to a managed datasource (Postgres/MySQL) and run `prisma migrate deploy`.

## Deployment

The app follows Shopify's standard deployment model. See the [Shopify deployment documentation](https://shopify.dev/docs/apps/launch/deployment) for hosting options including Google Cloud Run, Fly.io, and Render.

Production checklist:

1. Set `NODE_ENV=production`.
2. Replace the SQLite datasource with a managed database and run `prisma migrate deploy`.
3. Configure session cookie secrets and the Shopify API key/secret as environment variables.
4. Run `pnpm deploy` to push the app config and extensions to Shopify.

A `Dockerfile` is provided for container-based hosting; `pnpm docker-start` runs migrations and serves the build.

## Troubleshooting

**`The table 'main.Session' does not exist`** &mdash; Run `pnpm setup` to apply Prisma migrations.

**Embedded navigation breaks the iframe** &mdash; Use `Link` from `react-router` or `@shopify/polaris`, the `redirect` returned by `authenticate.admin`, and `useSubmit` from `react-router`. Avoid raw `<a>` tags.

**Theme embed isn't tracking** &mdash; The merchant must enable the AEO referrer embed under *Online Store &rarr; Themes &rarr; Customize &rarr; App embeds*.

**`"nbf" claim timestamp check failed`** &mdash; A JWT clock-skew error. Enable automatic time sync on your machine.

For additional Shopify-specific gotchas (webhook HMAC, GraphQL hints, Prisma on Windows ARM64) see the [Shopify React Router app template](https://github.com/Shopify/shopify-app-template-react-router#gotchas--troubleshooting).

## Contributing

Contributions are welcome. Please open an issue to discuss substantial changes before submitting a pull request.

1. Fork the repository and create a feature branch.
2. Run `pnpm lint` and `pnpm typecheck` before pushing.
3. Keep commits focused and write descriptive commit messages.

## License

This project is licensed under the MIT License &mdash; see the [LICENSE](LICENSE) file for details.
