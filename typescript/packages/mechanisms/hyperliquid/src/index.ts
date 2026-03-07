/**
 * Hyperliquid HyperCore support for x402 protocol.
 *
 * This package provides Hyperliquid network support for the x402 payment protocol,
 * using HyperCore's native gasless sendAsset action with EIP-712 signatures.
 *
 * Since HyperCore actions are gasless, this package includes a LocalHyperliquidFacilitatorClient
 * that runs verify/settle logic in-process, eliminating the need for a separate facilitator server.
 *
 * @module
 */

// Exact scheme client (default export from exact/)
export { ExactHyperliquidScheme } from "./exact";

// Types
export * from "./types";

// Constants
export * from "./constants";

// Signers
export * from "./signer";

// Utilities
export * from "./utils";

// Local facilitator client (no remote server needed)
export { LocalHyperliquidFacilitatorClient } from "./local-facilitator-client";
export type { LocalHyperliquidFacilitatorClientOptions } from "./local-facilitator-client";
