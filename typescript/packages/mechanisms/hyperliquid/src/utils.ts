import { recoverTypedDataAddress } from "viem";
import {
  DEFAULT_USDC,
  EIP712_DOMAIN_BASE,
  EIP712_TYPES,
  EXCHANGE_API_URLS,
  INFO_API_URLS,
  NETWORK_TO_CHAIN_NAME,
  SIGNING_CHAIN_IDS,
  SIGNATURE_CHAIN_ID_HEXES,
} from "./constants";
import type { HyperliquidSignature, HyperliquidSendAssetAction } from "./types";

/**
 * Checks if a network identifier is a supported Hyperliquid network
 *
 * @param network - The CAIP-2 network identifier
 * @returns true if the network is a supported Hyperliquid network
 */
export function isHyperliquidNetwork(network: string): boolean {
  return network in NETWORK_TO_CHAIN_NAME;
}

/**
 * Gets the hyperliquidChain name for a network (e.g., "Mainnet" or "Testnet")
 *
 * @param network - The CAIP-2 network identifier
 * @returns The chain name string
 * @throws If the network is not a supported Hyperliquid network
 */
export function getHyperliquidChainName(network: string): string {
  const chainName = NETWORK_TO_CHAIN_NAME[network];
  if (!chainName) {
    throw new Error(`Unknown Hyperliquid network: ${network}`);
  }
  return chainName;
}

/**
 * Gets the Exchange API URL for a network
 *
 * @param network - The CAIP-2 network identifier
 * @returns The exchange API URL
 * @throws If the network is not supported
 */
export function getExchangeApiUrl(network: string): string {
  const url = EXCHANGE_API_URLS[network];
  if (!url) {
    throw new Error(`No exchange API URL for network: ${network}`);
  }
  return url;
}

/**
 * Gets the Info API URL for a network
 *
 * @param network - The CAIP-2 network identifier
 * @returns The info API URL
 * @throws If the network is not supported
 */
export function getInfoApiUrl(network: string): string {
  const url = INFO_API_URLS[network];
  if (!url) {
    throw new Error(`No info API URL for network: ${network}`);
  }
  return url;
}

/**
 * Gets the EIP-712 domain for a specific network, with the correct signing chainId.
 *
 * @param network - The CAIP-2 network identifier
 * @returns The EIP-712 domain object
 * @throws If the network is not supported
 */
export function getEIP712Domain(network: string) {
  const chainId = SIGNING_CHAIN_IDS[network];
  if (!chainId) {
    throw new Error(`No signing chain ID for network: ${network}`);
  }
  return { ...EIP712_DOMAIN_BASE, chainId };
}

/**
 * Gets the signatureChainId hex string for a network.
 *
 * @param network - The CAIP-2 network identifier
 * @returns The hex string (e.g., "0x3e7" for mainnet)
 * @throws If the network is not supported
 */
export function getSignatureChainIdHex(network: string): string {
  const hex = SIGNATURE_CHAIN_ID_HEXES[network];
  if (!hex) {
    throw new Error(`No signature chain ID for network: ${network}`);
  }
  return hex;
}

/**
 * Gets the default USDC token identifier for a network
 *
 * @param network - The CAIP-2 network identifier
 * @returns The USDC token identifier in tokenName:tokenId format
 * @throws If no USDC address is configured for the network
 */
export function getUsdcToken(network: string): string {
  const token = DEFAULT_USDC[network];
  if (!token) {
    throw new Error(`No USDC token configured for network: ${network}`);
  }
  return token;
}

/**
 * Recovers the signer address from a sendAsset EIP-712 signature
 *
 * @param action - The signed sendAsset action
 * @param signature - The EIP-712 signature components
 * @param network - The CAIP-2 network identifier
 * @returns The recovered signer address
 */
export async function recoverSendAssetSigner(
  action: HyperliquidSendAssetAction,
  signature: HyperliquidSignature,
  network: string,
): Promise<`0x${string}`> {
  const hyperliquidChain = getHyperliquidChainName(network);

  // Reconstruct the compact signature from r, s, v
  const sig = `${signature.r}${signature.s.slice(2)}${signature.v.toString(16)}` as `0x${string}`;

  return recoverTypedDataAddress({
    domain: getEIP712Domain(network),
    types: EIP712_TYPES,
    primaryType: "HyperliquidTransaction:SendAsset",
    message: {
      hyperliquidChain,
      destination: action.destination,
      sourceDex: action.sourceDex,
      destinationDex: action.destinationDex,
      token: action.token,
      amount: action.amount,
      fromSubAccount: "",
      nonce: BigInt(action.nonce),
    },
    signature: sig,
  });
}

/**
 * Queries the client's spot balance via the Hyperliquid Info API
 *
 * @param network - The CAIP-2 network identifier
 * @param userAddress - The user's address
 * @param token - The token identifier (tokenName:tokenId format)
 * @returns The user's balance as a string, or "0" if not found
 */
export async function getSpotBalance(
  network: string,
  userAddress: string,
  token: string,
): Promise<string> {
  const infoUrl = getInfoApiUrl(network);

  const response = await fetch(infoUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "spotClearinghouseState",
      user: userAddress,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch spot balance: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as { balances?: Array<{ coin: string; total: string }> };

  // Extract token name from "USDC:0x..." format
  const tokenName = token.split(":")[0];

  const balance = data.balances?.find((b: { coin: string }) => b.coin === tokenName);
  return balance?.total ?? "0";
}

/**
 * Queries the client's perps withdrawable balance via the Hyperliquid Info API.
 * Only USDC is supported for perps transfers.
 *
 * @param network - The CAIP-2 network identifier
 * @param userAddress - The user's address
 * @returns The user's withdrawable perps balance as a string, or "0" if not found
 */
export async function getPerpsBalance(
  network: string,
  userAddress: string,
): Promise<string> {
  const infoUrl = getInfoApiUrl(network);

  const response = await fetch(infoUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "clearinghouseState",
      user: userAddress,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch perps balance: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as { withdrawable?: string };
  return data.withdrawable ?? "0";
}

/**
 * Submits a signed sendAsset action to the Hyperliquid Exchange API
 *
 * @param network - The CAIP-2 network identifier
 * @param action - The sendAsset action
 * @param signature - The EIP-712 signature
 * @returns The API response
 */
export async function submitSendAsset(
  network: string,
  action: HyperliquidSendAssetAction,
  signature: HyperliquidSignature,
): Promise<{ status: string; response?: { type: string } }> {
  const exchangeUrl = getExchangeApiUrl(network);
  const hyperliquidChain = getHyperliquidChainName(network);

  const body = {
    action: {
      type: "sendAsset",
      hyperliquidChain,
      signatureChainId: getSignatureChainIdHex(network),
      destination: action.destination,
      sourceDex: action.sourceDex,
      destinationDex: action.destinationDex,
      token: action.token,
      amount: action.amount,
      fromSubAccount: "",
      nonce: action.nonce,
    },
    nonce: action.nonce,
    signature: {
      r: signature.r,
      s: signature.s,
      v: signature.v,
    },
  };

  const response = await fetch(exchangeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Hyperliquid exchange API error (${response.status}): ${text}`);
  }

  return response.json() as Promise<{ status: string; response?: { type: string } }>;
}

/**
 * Compares two Ethereum addresses case-insensitively
 *
 * @param a - First address
 * @param b - Second address
 * @returns true if addresses match
 */
export function addressesEqual(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Parses a balance string and compares it to a required amount
 *
 * @param balance - The balance as a string
 * @param requiredAmount - The required amount as a string
 * @returns true if balance >= requiredAmount
 */
export function hasSufficientBalance(balance: string, requiredAmount: string): boolean {
  const bal = parseFloat(balance);
  const req = parseFloat(requiredAmount);
  if (isNaN(bal) || isNaN(req)) return false;
  return bal >= req;
}
