import {
  PaymentRequirements,
  SchemeNetworkClient,
  PaymentPayloadResult,
} from "@x402/core/types";
import { ClientHyperliquidSigner } from "../../signer";
import { DEX_SPOT, EIP712_TYPES } from "../../constants";
import { getEIP712Domain, getHyperliquidChainName, isHyperliquidNetwork } from "../../utils";
import type { Dex, ExactHyperliquidPayloadV2 } from "../../types";

/**
 * Hyperliquid client implementation for the Exact payment scheme.
 * Signs a HyperCore sendAsset action as EIP-712 typed data.
 *
 * Since HyperCore actions are gasless, the client's signature is the
 * complete authorization — no facilitator co-signing is needed.
 */
export class ExactHyperliquidScheme implements SchemeNetworkClient {
  readonly scheme = "exact";

  /**
   * Creates a new ExactHyperliquidScheme client.
   *
   * @param signer - A signer with EIP-712 signTypedData capability
   * @param sourceDex - Source balance for transfers. Use DEX_SPOT or DEX_PERPS. Defaults to DEX_SPOT.
   */
  constructor(
    private readonly signer: ClientHyperliquidSigner,
    private readonly sourceDex: Dex = DEX_SPOT,
  ) {}

  /**
   * Creates a payment payload by signing a sendAsset action.
   *
   * @param x402Version - The x402 protocol version
   * @param paymentRequirements - The payment requirements from the server
   * @returns The signed payment payload
   */
  async createPaymentPayload(
    x402Version: number,
    paymentRequirements: PaymentRequirements,
  ): Promise<PaymentPayloadResult> {
    const { network, payTo, asset, amount, extra } = paymentRequirements;

    if (!isHyperliquidNetwork(network)) {
      throw new Error(`Unsupported network: ${network}`);
    }

    const hyperliquidChain = getHyperliquidChainName(network);
    const nonce = Date.now();
    const destinationDex = (extra?.destinationDex as Dex) ?? DEX_SPOT;

    // Build the EIP-712 message
    const message = {
      hyperliquidChain,
      destination: payTo,
      sourceDex: this.sourceDex,
      destinationDex,
      token: asset,
      amount,
      fromSubAccount: "",
      nonce: BigInt(nonce),
    };

    // Sign the EIP-712 typed data
    const signature = await this.signer.signTypedData({
      domain: getEIP712Domain(network) as unknown as Record<string, unknown>,
      types: EIP712_TYPES as unknown as Record<string, unknown>,
      primaryType: "HyperliquidTransaction:SendAsset",
      message: message as unknown as Record<string, unknown>,
    });

    // Parse the 65-byte signature into r, s, v components
    const r = ("0x" + signature.slice(2, 66)) as string;
    const s = ("0x" + signature.slice(66, 130)) as string;
    const v = parseInt(signature.slice(130, 132), 16);

    const payload: ExactHyperliquidPayloadV2 = {
      signature: { r, s, v },
      action: {
        destination: payTo,
        sourceDex: this.sourceDex,
        destinationDex,
        token: asset,
        amount,
        nonce,
      },
    };

    return {
      x402Version,
      payload: payload as unknown as Record<string, unknown>,
    };
  }
}
