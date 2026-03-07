import { DEX_PERPS, DEX_SPOT, HYPERLIQUID_WILDCARD_CAIP2, MAX_FUTURE_SKEW_MS } from "../../constants";
import { isExactHyperliquidPayload, ExactHyperliquidPayloadV2 } from "../../types";
import {
  isHyperliquidNetwork,
  addressesEqual,
  recoverSendAssetSigner,
  getSpotBalance,
  getPerpsBalance,
  hasSufficientBalance,
  submitSendAsset,
} from "../../utils";
import type {
  Network,
  PaymentPayload,
  PaymentRequirements,
  SchemeNetworkFacilitator,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";

const SUPPORTED_X402_VERSION = 2;

/**
 * Helper to create a VerifyResponse with isValid: false.
 */
function invalidVerifyResponse(reason: string, payer?: string): VerifyResponse {
  return { isValid: false, invalidReason: reason, payer };
}

/**
 * Helper to create a VerifyResponse with isValid: true.
 */
function validVerifyResponse(payer: string): VerifyResponse {
  return { isValid: true, payer };
}

/**
 * Hyperliquid facilitator implementation for the Exact payment scheme.
 *
 * Verifies that the client's signed sendAsset action matches the payment requirements,
 * then submits it to the Hyperliquid Exchange API. Since HyperCore actions are gasless,
 * this facilitator needs no private key and bears no cost.
 */
export class ExactHyperliquidScheme implements SchemeNetworkFacilitator {
  readonly scheme = "exact";
  readonly caipFamily = HYPERLIQUID_WILDCARD_CAIP2;

  /**
   * No extra data needed — there is no fee payer or facilitator signer.
   */
  getExtra(_network: Network): Record<string, unknown> | undefined {
    return undefined;
  }

  /**
   * No facilitator signers — HyperCore actions are fully client-signed.
   */
  getSigners(_network: string): string[] {
    return [];
  }

  /**
   * Verifies a payment payload against requirements.
   *
   * Checks:
   * 1. Protocol version, scheme, and network
   * 2. Payload structure
   * 3. Transfer correctness (token, amount, destination, destinationDex match requirements)
   * 4. Temporal validity (action.nonce within maxTimeoutSeconds and clock skew)
   * 5. Signature recovery (identifies the payer)
   * 6. Balance sufficiency
   *
   * @param payload - The payment payload from the client
   * @param requirements - The server's payment requirements
   * @returns Verification result
   */
  async verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    // 1. Protocol validation
    if (payload.x402Version !== SUPPORTED_X402_VERSION) {
      return invalidVerifyResponse(
        `unsupported_x402_version: expected ${SUPPORTED_X402_VERSION}, got ${payload.x402Version}`,
      );
    }

    if (requirements.scheme !== "exact") {
      return invalidVerifyResponse(`unsupported_scheme: expected exact, got ${requirements.scheme}`);
    }

    if (!isHyperliquidNetwork(requirements.network)) {
      return invalidVerifyResponse(`unsupported_network: ${requirements.network}`);
    }

    // 2. Payload structure validation
    if (!isExactHyperliquidPayload(payload.payload)) {
      return invalidVerifyResponse("invalid_payload_structure");
    }

    const hlPayload = payload.payload as unknown as ExactHyperliquidPayloadV2;
    const { action, signature } = hlPayload;

    // 3. Transfer correctness (security-critical)
    // These checks compare against requirements, NOT payload.accepted
    if (action.token !== requirements.asset) {
      return invalidVerifyResponse(
        `token_mismatch: expected ${requirements.asset}, got ${action.token}`,
      );
    }

    if (action.amount !== requirements.amount) {
      return invalidVerifyResponse(
        `amount_mismatch: expected ${requirements.amount}, got ${action.amount}`,
      );
    }

    if (!addressesEqual(action.destination, requirements.payTo)) {
      return invalidVerifyResponse(
        `destination_mismatch: expected ${requirements.payTo}, got ${action.destination}`,
      );
    }

    // Verify destinationDex matches what the server requested (default: DEX_SPOT)
    const requiredDestinationDex = (requirements.extra?.destinationDex as string) ?? DEX_SPOT;
    if (action.destinationDex !== requiredDestinationDex) {
      return invalidVerifyResponse(
        `destinationDex_mismatch: expected ${requiredDestinationDex}, got ${action.destinationDex}`,
      );
    }

    // 4. Temporal validity
    const now = Date.now();
    const actionAge = now - action.nonce;
    const maxAgeMs = requirements.maxTimeoutSeconds * 1000;

    if (actionAge > maxAgeMs) {
      return invalidVerifyResponse(
        `action_expired: age ${actionAge}ms exceeds max ${maxAgeMs}ms`,
      );
    }

    if (action.nonce - now > MAX_FUTURE_SKEW_MS) {
      return invalidVerifyResponse(
        `action_too_future: ${action.nonce - now}ms ahead, max ${MAX_FUTURE_SKEW_MS}ms`,
      );
    }

    // 5. Signature recovery — identifies the payer
    let payer: string;
    try {
      payer = await recoverSendAssetSigner(action, signature, requirements.network);
    } catch (error) {
      return invalidVerifyResponse(
        `signature_recovery_failed: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }

    // 6. Balance check (required — sendAsset cannot be simulated or atomically reverted)
    const isPerpsSource = action.sourceDex === DEX_PERPS;
    if (isPerpsSource) {
      // Perps transfers only support USDC
      const tokenName = action.token.split(":")[0];
      if (tokenName !== "USDC") {
        return invalidVerifyResponse(
          `perps_usdc_only: perps transfers only support USDC, got ${tokenName}`,
          payer,
        );
      }
    }

    try {
      const balance = isPerpsSource
        ? await getPerpsBalance(requirements.network, payer)
        : await getSpotBalance(requirements.network, payer, action.token);
      if (!hasSufficientBalance(balance, requirements.amount)) {
        return invalidVerifyResponse(
          `insufficient_balance: has ${balance}, needs ${requirements.amount}`,
          payer,
        );
      }
    } catch (error) {
      return invalidVerifyResponse(
        `balance_check_failed: ${error instanceof Error ? error.message : "unknown"}`,
        payer,
      );
    }

    return validVerifyResponse(payer);
  }

  /**
   * Settles a payment by submitting the signed action to the Hyperliquid Exchange API.
   *
   * Settlement performs full verification independently, then submits the action.
   * A successful response from Hyperliquid is `{"status": "ok"}`.
   *
   * @param payload - The payment payload from the client
   * @param requirements - The server's payment requirements
   * @returns Settlement result
   */
  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    // Re-verify: settle MUST NOT assume prior verification
    const verifyResult = await this.verify(payload, requirements);
    if (!verifyResult.isValid) {
      return {
        success: false,
        errorReason: verifyResult.invalidReason,
        errorMessage: verifyResult.invalidMessage,
        payer: verifyResult.payer,
        transaction: "",
        network: requirements.network,
      };
    }

    const hlPayload = payload.payload as unknown as ExactHyperliquidPayloadV2;
    const { action, signature } = hlPayload;

    // Submit to Hyperliquid Exchange API
    try {
      const result = await submitSendAsset(requirements.network, action, signature);

      if (result.status !== "ok") {
        return {
          success: false,
          errorReason: `hyperliquid_api_rejected: ${JSON.stringify(result)}`,
          payer: verifyResult.payer,
          transaction: "",
          network: requirements.network,
        };
      }

      return {
        success: true,
        payer: verifyResult.payer,
        // HyperCore sendAsset does not return a transaction hash
        transaction: "",
        network: requirements.network,
      };
    } catch (error) {
      return {
        success: false,
        errorReason: `settlement_failed: ${error instanceof Error ? error.message : "unknown"}`,
        payer: verifyResult.payer,
        transaction: "",
        network: requirements.network,
      };
    }
  }
}
