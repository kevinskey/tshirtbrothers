# @tshirtbrothers/design-studio

The Fabric.js v6 design studio extracted from tshirtbrothers.com/design.

Consumed by:

- **TSB storefront** — `client/src/pages/DesignStudioPage.tsx` composes the pieces into the full product-configuration flow.
- **GleeWorld** — embeds the same components white-labeled per tenant. Save flow drops `MerchDesign` JSON into `gw_merch_designs`.

## Public API

Everything ships from `src/index.ts`. See that file for the current surface. The portable **`MerchDesign`** JSON shape (in `src/types/merch-design.ts`) is the interchange contract between authoring and fulfillment — that's what TB's print pipeline consumes.

## Distribution

Source-only. Consumers are Vite apps that handle TS/TSX natively. No build step, no dist folder. When we publish externally, add tsup/rollup.

## Peer deps

`react`, `react-dom`, `fabric`, `lucide-react`. The consumer provides these.
