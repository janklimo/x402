import { getUsdcToken } from "../../utils";
import type {
  AssetAmount,
  Network,
  PaymentRequirements,
  Price,
  SchemeNetworkServer,
  MoneyParser,
} from "@x402/core/types";

/**
 * Hyperliquid server implementation for the Exact payment scheme.
 * Handles price parsing and payment requirements building.
 */
export class ExactHyperliquidScheme implements SchemeNetworkServer {
  readonly scheme = "exact";
  private moneyParsers: MoneyParser[] = [];

  /**
   * Register a custom money parser in the parser chain.
   * Parsers are tried in registration order; return null to skip to the next.
   *
   * @param parser - Custom function to convert amount to AssetAmount (or null to skip)
   * @returns The instance for chaining
   */
  registerMoneyParser(parser: MoneyParser): ExactHyperliquidScheme {
    this.moneyParsers.push(parser);
    return this;
  }

  /**
   * Parses a price into an AssetAmount.
   * Tries AssetAmount pass-through, then custom parsers, then default USDC conversion.
   *
   * @param price - The price to parse
   * @param network - The network identifier
   * @returns The parsed asset amount
   */
  async parsePrice(price: Price, network: Network): Promise<AssetAmount> {
    // If already an AssetAmount, return directly
    if (typeof price === "object" && price !== null && "amount" in price) {
      if (!price.asset) {
        throw new Error(`Asset identifier must be specified for AssetAmount on network ${network}`);
      }
      return {
        amount: price.amount,
        asset: price.asset,
        extra: price.extra || {},
      };
    }

    // Parse Money to decimal number
    const amount = this.parseMoneyToDecimal(price);

    // Try custom money parsers
    for (const parser of this.moneyParsers) {
      const result = await parser(amount, network);
      if (result !== null) {
        return result;
      }
    }

    // Default: convert to USDC
    return this.defaultMoneyConversion(amount, network);
  }

  /**
   * Build payment requirements for this scheme/network.
   * Hyperliquid needs no extra enhancement since there's no fee payer.
   *
   * @param paymentRequirements - Base requirements with amount/asset set
   * @param supportedKind - The supported kind from facilitator
   * @param extensionKeys - Extension keys supported by the facilitator
   * @returns The payment requirements (passed through unchanged)
   */
  enhancePaymentRequirements(
    paymentRequirements: PaymentRequirements,
    supportedKind: {
      x402Version: number;
      scheme: string;
      network: Network;
      extra?: Record<string, unknown>;
    },
    extensionKeys: string[],
  ): Promise<PaymentRequirements> {
    void supportedKind;
    void extensionKeys;
    return Promise.resolve(paymentRequirements);
  }

  private parseMoneyToDecimal(money: string | number): number {
    if (typeof money === "number") {
      return money;
    }
    const cleanMoney = money.replace(/^\$/, "").trim();
    const amount = parseFloat(cleanMoney);
    if (isNaN(amount)) {
      throw new Error(`Invalid money format: ${money}`);
    }
    return amount;
  }

  private defaultMoneyConversion(amount: number, network: Network): AssetAmount {
    return {
      amount: amount.toString(),
      asset: getUsdcToken(network),
      extra: {},
    };
  }
}
