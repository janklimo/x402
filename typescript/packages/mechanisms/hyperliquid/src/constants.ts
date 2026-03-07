import type { Network } from "@x402/core/types";
import type { Dex } from "./types";

/**
 * CAIP-2 network identifiers for Hyperliquid HyperCore
 */
export const HYPERLIQUID_MAINNET_CAIP2 = "hyperliquid:mainnet" as Network;
export const HYPERLIQUID_TESTNET_CAIP2 = "hyperliquid:testnet" as Network;
export const HYPERLIQUID_WILDCARD_CAIP2 = "hyperliquid:*";

/**
 * Hyperliquid Exchange API endpoints
 */
export const EXCHANGE_API_URLS: Record<string, string> = {
  "hyperliquid:mainnet": "https://api.hyperliquid.xyz/exchange",
  "hyperliquid:testnet": "https://api.hyperliquid-testnet.xyz/exchange",
};

/**
 * Hyperliquid Info API endpoints
 */
export const INFO_API_URLS: Record<string, string> = {
  "hyperliquid:mainnet": "https://api.hyperliquid.xyz/info",
  "hyperliquid:testnet": "https://api.hyperliquid-testnet.xyz/info",
};

/**
 * Mapping from CAIP-2 network to the `hyperliquidChain` field used in signed actions
 */
export const NETWORK_TO_CHAIN_NAME: Record<string, string> = {
  "hyperliquid:mainnet": "Mainnet",
  "hyperliquid:testnet": "Testnet",
};

/**
 * EIP-712 signing chain IDs per network.
 *
 * Browser wallets (MetaMask, Rabby, etc.) enforce that the EIP-712 domain chainId
 * matches the connected chain. The HyperEVM chain IDs are 999 (mainnet) and 998 (testnet).
 *
 * The Python SDK uses 421614 for server-side signing with local private keys,
 * where no wallet enforcement exists. Both chainIds are accepted by the Hyperliquid API
 * as long as the signatureChainId in the request body matches.
 */
export const SIGNING_CHAIN_IDS: Record<string, number> = {
  "hyperliquid:mainnet": 999,
  "hyperliquid:testnet": 998,
};

/**
 * Base EIP-712 signing domain for HyperCore user-signed actions.
 * Use `getEIP712Domain(network)` to get the domain with the correct chainId.
 */
export const EIP712_DOMAIN_BASE = {
  name: "HyperliquidSignTransaction",
  version: "1",
  verifyingContract: "0x0000000000000000000000000000000000000000" as `0x${string}`,
} as const;


/**
 * EIP-712 type definition for HyperliquidTransaction:SendAsset
 */
export const EIP712_TYPES = {
  "HyperliquidTransaction:SendAsset": [
    { name: "hyperliquidChain", type: "string" },
    { name: "destination", type: "string" },
    { name: "sourceDex", type: "string" },
    { name: "destinationDex", type: "string" },
    { name: "token", type: "string" },
    { name: "amount", type: "string" },
    { name: "fromSubAccount", type: "string" },
    { name: "nonce", type: "uint64" },
  ],
} as const;

/**
 * The signatureChainId included in the exchange API request body, per network.
 * Must match the chainId used in the EIP-712 domain for signature recovery.
 */
export const SIGNATURE_CHAIN_ID_HEXES: Record<string, string> = {
  "hyperliquid:mainnet": "0x3e7",   // 999
  "hyperliquid:testnet": "0x3e6",   // 998
};


/**
 * Default USDC token identifiers per network.
 * Format: tokenName:tokenId
 */
export const DEFAULT_USDC: Record<string, string> = {
  "hyperliquid:mainnet": "USDC:0x6d1e7cde53ba9467b783cb7c530ce054",
  "hyperliquid:testnet": "USDC:0xeb62eee3685fc4c43992febcd9e75443",
};


/**
 * DEX identifiers for sendAsset source/destination.
 * Use "spot" for spot balance, "" for the default USDC perps DEX.
 */
export const DEX_SPOT: Dex = "spot";
export const DEX_PERPS: Dex = "";

/**
 * Maximum clock skew tolerance in milliseconds for temporal validation
 */
export const MAX_FUTURE_SKEW_MS = 5000;
