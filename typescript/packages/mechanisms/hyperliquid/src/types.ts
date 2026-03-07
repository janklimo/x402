/**
 * A HyperCore sendAsset action that was signed by the client.
 *
 * Uses the `sendAsset` action type which supports transfers between
 * spot and perp balances. Use `sourceDex: "spot"` / `destinationDex: "spot"`
 * for spot transfers, or `""` for perps.
 */
/**
 * The two valid DEX identifiers for sendAsset source/destination.
 * "spot" = spot balance, "" = default USDC perps DEX.
 */
export type Dex = "spot" | "";

export interface HyperliquidSendAssetAction {
  /** Recipient address (42-char hex) */
  destination: string;
  /** Source balance: "spot" for spot, "" for default perp DEX */
  sourceDex: Dex;
  /** Destination balance: "spot" for spot, "" for default perp DEX */
  destinationDex: Dex;
  /** Token identifier in tokenName:tokenId format */
  token: string;
  /** Human-readable amount as a string */
  amount: string;
  /** Millisecond timestamp acting as nonce */
  nonce: number;
}

/**
 * EIP-712 signature components
 */
export interface HyperliquidSignature {
  r: string;
  s: string;
  v: number;
}

/**
 * The payload field of a PaymentPayload for exact scheme on Hyperliquid
 */
export interface ExactHyperliquidPayloadV2 {
  signature: HyperliquidSignature;
  action: HyperliquidSendAssetAction;
}

/**
 * Type guard for ExactHyperliquidPayloadV2
 */
export function isExactHyperliquidPayload(payload: unknown): payload is ExactHyperliquidPayloadV2 {
  if (typeof payload !== "object" || payload === null) return false;
  const p = payload as Record<string, unknown>;

  if (typeof p.signature !== "object" || p.signature === null) return false;
  const sig = p.signature as Record<string, unknown>;
  if (typeof sig.r !== "string" || typeof sig.s !== "string" || typeof sig.v !== "number")
    return false;

  if (typeof p.action !== "object" || p.action === null) return false;
  const action = p.action as Record<string, unknown>;
  return (
    typeof action.destination === "string" &&
    typeof action.sourceDex === "string" &&
    typeof action.destinationDex === "string" &&
    typeof action.token === "string" &&
    typeof action.amount === "string" &&
    typeof action.nonce === "number"
  );
}
