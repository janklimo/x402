import { describe, expect, it, vi, beforeEach } from "vitest";
import { ExactHyperliquidScheme } from "../../src/exact/facilitator/scheme";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import type { ExactHyperliquidPayloadV2 } from "../../src/types";

// Mock the utils module
vi.mock("../../src/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/utils")>();
  return {
    ...actual,
    recoverSendAssetSigner: vi.fn().mockResolvedValue("0xPayerAddress1234567890abcdef12345678"),
    getSpotBalance: vi.fn().mockResolvedValue("100.0"),
    getPerpsBalance: vi.fn().mockResolvedValue("100.0"),
    submitSendAsset: vi.fn().mockResolvedValue({ status: "ok", response: { type: "default" } }),
  };
});

import { recoverSendAssetSigner, getSpotBalance, getPerpsBalance, submitSendAsset } from "../../src/utils";

function createValidPayload(): ExactHyperliquidPayloadV2 {
  return {
    signature: {
      r: "0x" + "ab".repeat(32),
      s: "0x" + "cd".repeat(32),
      v: 28,
    },
    action: {
      destination: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      sourceDex: "spot",
      destinationDex: "spot",
      token: "USDC:0x6d1e7cde53ba9467b783cb7c530ce054",
      amount: "1.5",
      nonce: Date.now(),
    },
  };
}

function createPaymentPayload(hlPayload?: Partial<ExactHyperliquidPayloadV2>): PaymentPayload {
  const p = { ...createValidPayload(), ...hlPayload };
  return {
    x402Version: 2,
    payload: p as unknown as Record<string, unknown>,
    accepted: createRequirements(),
  };
}

function createRequirements(overrides?: Partial<PaymentRequirements>): PaymentRequirements {
  return {
    scheme: "exact",
    network: "hyperliquid:mainnet",
    asset: "USDC:0x6d1e7cde53ba9467b783cb7c530ce054",
    amount: "1.5",
    payTo: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
    maxTimeoutSeconds: 60,
    extra: {},
    ...overrides,
  };
}

describe("ExactHyperliquidScheme (facilitator)", () => {
  let scheme: ExactHyperliquidScheme;

  beforeEach(() => {
    scheme = new ExactHyperliquidScheme();
    vi.clearAllMocks();
    // Reset default mocks
    (recoverSendAssetSigner as ReturnType<typeof vi.fn>).mockResolvedValue(
      "0xPayerAddress1234567890abcdef12345678",
    );
    (getSpotBalance as ReturnType<typeof vi.fn>).mockResolvedValue("100.0");
    (getPerpsBalance as ReturnType<typeof vi.fn>).mockResolvedValue("100.0");
    (submitSendAsset as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "ok",
      response: { type: "default" },
    });
  });

  describe("getExtra / getSigners", () => {
    it("should return undefined for getExtra (no fee payer)", () => {
      expect(scheme.getExtra("hyperliquid:mainnet")).toBeUndefined();
    });

    it("should return empty array for getSigners (no facilitator signers)", () => {
      expect(scheme.getSigners("hyperliquid:mainnet")).toEqual([]);
    });
  });

  describe("verify", () => {
    it("should verify a valid payment", async () => {
      const result = await scheme.verify(createPaymentPayload(), createRequirements());
      expect(result.isValid).toBe(true);
      expect(result.payer).toBeDefined();
    });

    it("should reject unsupported x402 version", async () => {
      const payload = createPaymentPayload();
      payload.x402Version = 1;
      const result = await scheme.verify(payload, createRequirements());
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toContain("unsupported_x402_version");
    });

    it("should reject unsupported scheme", async () => {
      const result = await scheme.verify(
        createPaymentPayload(),
        createRequirements({ scheme: "upto" }),
      );
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toContain("unsupported_scheme");
    });

    it("should reject unsupported network", async () => {
      const result = await scheme.verify(
        createPaymentPayload(),
        createRequirements({ network: "eip155:1" }),
      );
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toContain("unsupported_network");
    });

    it("should reject token mismatch", async () => {
      const result = await scheme.verify(
        createPaymentPayload(),
        createRequirements({ asset: "HYPE:0xdeadbeef" }),
      );
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toContain("token_mismatch");
    });

    it("should reject amount mismatch", async () => {
      const result = await scheme.verify(
        createPaymentPayload(),
        createRequirements({ amount: "999.0" }),
      );
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toContain("amount_mismatch");
    });

    it("should reject destination mismatch", async () => {
      const result = await scheme.verify(
        createPaymentPayload(),
        createRequirements({ payTo: "0x0000000000000000000000000000000000000000" }),
      );
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toContain("destination_mismatch");
    });

    it("should reject destinationDex mismatch", async () => {
      // Server requires perps destination but client sends to spot
      const result = await scheme.verify(
        createPaymentPayload(),
        createRequirements({ extra: { destinationDex: "" } }),
      );
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toContain("destinationDex_mismatch");
    });

    it("should accept matching destinationDex", async () => {
      const hlPayload = createValidPayload();
      hlPayload.action.destinationDex = "";
      const payload = createPaymentPayload(hlPayload);

      const result = await scheme.verify(
        payload,
        createRequirements({ extra: { destinationDex: "" } }),
      );
      expect(result.isValid).toBe(true);
    });

    it("should reject expired actions", async () => {
      const hlPayload = createValidPayload();
      hlPayload.action.nonce = Date.now() - 120_000; // 2 minutes ago
      const payload = createPaymentPayload(hlPayload);

      const result = await scheme.verify(payload, createRequirements({ maxTimeoutSeconds: 60 }));
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toContain("action_expired");
    });

    it("should reject future actions beyond skew tolerance", async () => {
      const hlPayload = createValidPayload();
      hlPayload.action.nonce = Date.now() + 10_000; // 10 seconds in the future
      const payload = createPaymentPayload(hlPayload);

      const result = await scheme.verify(payload, createRequirements());
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toContain("action_too_future");
    });

    it("should reject when signature recovery fails", async () => {
      (recoverSendAssetSigner as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("invalid signature"),
      );

      const result = await scheme.verify(createPaymentPayload(), createRequirements());
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toContain("signature_recovery_failed");
    });

    it("should reject when balance is insufficient", async () => {
      (getSpotBalance as ReturnType<typeof vi.fn>).mockResolvedValue("0.5");

      const result = await scheme.verify(createPaymentPayload(), createRequirements());
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toContain("insufficient_balance");
    });

    it("should reject when balance check API fails", async () => {
      (getSpotBalance as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("API down"));

      const result = await scheme.verify(createPaymentPayload(), createRequirements());
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toContain("balance_check_failed");
    });

    it("should use perps balance check when sourceDex is empty string", async () => {
      const hlPayload = createValidPayload();
      hlPayload.action.sourceDex = "";
      hlPayload.action.destinationDex = "spot";
      const payload = createPaymentPayload(hlPayload);

      const result = await scheme.verify(payload, createRequirements());
      expect(result.isValid).toBe(true);
      expect(getPerpsBalance).toHaveBeenCalledOnce();
      expect(getSpotBalance).not.toHaveBeenCalled();
    });

    it("should use spot balance check when sourceDex is spot", async () => {
      const result = await scheme.verify(createPaymentPayload(), createRequirements());
      expect(result.isValid).toBe(true);
      expect(getSpotBalance).toHaveBeenCalledOnce();
      expect(getPerpsBalance).not.toHaveBeenCalled();
    });

    it("should reject non-USDC tokens from perps source", async () => {
      const hlPayload = createValidPayload();
      hlPayload.action.sourceDex = "";
      hlPayload.action.token = "HYPE:0xdeadbeef";
      const payload = createPaymentPayload(hlPayload);

      const result = await scheme.verify(
        payload,
        createRequirements({ asset: "HYPE:0xdeadbeef" }),
      );
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toContain("perps_usdc_only");
    });

    it("should reject insufficient perps balance", async () => {
      (getPerpsBalance as ReturnType<typeof vi.fn>).mockResolvedValue("0.05");

      const hlPayload = createValidPayload();
      hlPayload.action.sourceDex = "";
      hlPayload.action.destinationDex = "spot";
      const payload = createPaymentPayload(hlPayload);

      const result = await scheme.verify(payload, createRequirements());
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toContain("insufficient_balance");
    });

    it("should reject invalid payload structure", async () => {
      const payload: PaymentPayload = {
        x402Version: 2,
        payload: { garbage: true } as unknown as Record<string, unknown>,
        accepted: createRequirements(),
      };

      const result = await scheme.verify(payload, createRequirements());
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toContain("invalid_payload_structure");
    });
  });

  describe("settle", () => {
    it("should settle a valid payment", async () => {
      const result = await scheme.settle(createPaymentPayload(), createRequirements());
      expect(result.success).toBe(true);
      expect(result.network).toBe("hyperliquid:mainnet");
      expect(result.payer).toBeDefined();
      expect(submitSendAsset).toHaveBeenCalledOnce();
    });

    it("should fail settlement when verification fails", async () => {
      const result = await scheme.settle(
        createPaymentPayload(),
        createRequirements({ asset: "WRONG:0x" }),
      );
      expect(result.success).toBe(false);
      expect(result.errorReason).toContain("token_mismatch");
      expect(submitSendAsset).not.toHaveBeenCalled();
    });

    it("should fail when Hyperliquid API rejects", async () => {
      (submitSendAsset as ReturnType<typeof vi.fn>).mockResolvedValue({
        status: "error",
        response: { type: "error" },
      });

      const result = await scheme.settle(createPaymentPayload(), createRequirements());
      expect(result.success).toBe(false);
      expect(result.errorReason).toContain("hyperliquid_api_rejected");
    });

    it("should fail when API call throws", async () => {
      (submitSendAsset as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network error"));

      const result = await scheme.settle(createPaymentPayload(), createRequirements());
      expect(result.success).toBe(false);
      expect(result.errorReason).toContain("settlement_failed");
    });

    it("should return empty transaction string (no tx hash from HyperCore)", async () => {
      const result = await scheme.settle(createPaymentPayload(), createRequirements());
      expect(result.transaction).toBe("");
    });
  });
});
