import { x402Facilitator } from "@x402/core/facilitator";
import type {
  PaymentPayload,
  PaymentRequirements,
  VerifyResponse,
  SettleResponse,
  SupportedResponse,
  Network,
} from "@x402/core/types";
import { ExactHyperliquidScheme } from "./exact/facilitator/scheme";

/**
 * Interface matching the FacilitatorClient contract from @x402/core/server.
 * Defined here to avoid a direct import dependency on server internals.
 */
interface FacilitatorClient {
  verify(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<VerifyResponse>;
  settle(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<SettleResponse>;
  getSupported(): Promise<SupportedResponse>;
}

/**
 * Options for the local Hyperliquid facilitator client
 */
export interface LocalHyperliquidFacilitatorClientOptions {
  /** Networks to register (e.g., ["hyperliquid:mainnet"]) */
  networks: Network[];
}

/**
 * A local (in-process) facilitator client for Hyperliquid.
 *
 * Since HyperCore spotSend is gasless and requires no facilitator co-signing,
 * the verify/settle logic can run directly in the resource server process.
 * This eliminates the need for a separate facilitator server.
 *
 * Use this instead of HTTPFacilitatorClient for Hyperliquid payments:
 *
 * ```typescript
 * import { x402ResourceServer } from "@x402/core/server";
 * import { LocalHyperliquidFacilitatorClient } from "@x402/hyperliquid";
 *
 * const server = new x402ResourceServer(
 *   new LocalHyperliquidFacilitatorClient({
 *     networks: ["hyperliquid:mainnet"],
 *   })
 * );
 * ```
 */
export class LocalHyperliquidFacilitatorClient implements FacilitatorClient {
  private readonly facilitator: x402Facilitator;

  constructor(options: LocalHyperliquidFacilitatorClientOptions) {
    this.facilitator = new x402Facilitator();
    const scheme = new ExactHyperliquidScheme();
    this.facilitator.register(options.networks, scheme);
  }

  async verify(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    return this.facilitator.verify(paymentPayload, paymentRequirements);
  }

  async settle(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    return this.facilitator.settle(paymentPayload, paymentRequirements);
  }

  async getSupported(): Promise<SupportedResponse> {
    return this.facilitator.getSupported() as SupportedResponse;
  }
}
