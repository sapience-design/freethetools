# 2. Static site, with the work done in the browser

Date: 2026-09-27 · Status: accepted

## Context

The tools must be free forever and must not upload files. A server that processes files costs money, needs scaling, and is a place where files could be kept or leaked.

## Decision

Build the site as static files with Astro and serve them as static assets on Cloudflare Workers, with no server code. Every tool does its work in the browser, using WebAssembly and Web Workers for heavy jobs.

## Consequences

- Hosting is free and pages are fast; there is no server to secure or pay for.
- Tools are limited to what browsers can do. Requests that need a server are declined.
- Heavy engines (Ghostscript is 16 MB) cost a one-time download, cached afterwards.
- A hosted API that runs tools is out of scope for the site; it would be a separate, opt-in service with its own privacy terms.
