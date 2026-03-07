import { describe, expect, it, vi } from "vitest";
import { ExactHyperliquidScheme } from "../../src/exact/client/scheme";
import type { PaymentRequirements } from "@x402/core/types";
import type { ClientHyperliquidSigner } from "../../src/signer";

function createMockSigner(address: `0x${string}` = "0x1234567890abcdef1234567890abcdef12345678"): ClientHyperliquidSigner {
  return {
    address,
    signTypedData: vi.fn().mockResolvedValue(
      "0x" + "ab".repeat(32) + "cd".repeat(32) + "1b", // r + s + v(27)
    ),
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

describe("ExactHyperliquidScheme (client)", () => {
  it("should create a payment payload with correct structure", async () => {
    const signer = createMockSigner();
    const scheme = new ExactHyperliquidScheme(signer);
    const requirements = createRequirements();

    const result = await scheme.createPaymentPayload(2, requirements);

    expect(result.x402Version).toBe(2);
    expect(result.payload).toBeDefined();

    const payload = result.payload as Record<string, unknown>;
    expect(payload.signature).toBeDefined();
    expect(payload.action).toBeDefined();

    const action = payload.action as Record<string, unknown>;
    expect(action.destination).toBe(requirements.payTo);
    expect(action.token).toBe(requirements.asset);
    expect(action.amount).toBe(requirements.amount);
    expect(action.sourceDex).toBe("spot");
    expect(action.destinationDex).toBe("spot");
    expect(typeof action.nonce).toBe("number");
  });

  it("should call signTypedData with correct EIP-712 parameters", async () => {
    const signer = createMockSigner();
    const scheme = new ExactHyperliquidScheme(signer);
    const requirements = createRequirements();

    await scheme.createPaymentPayload(2, requirements);

    expect(signer.signTypedData).toHaveBeenCalledOnce();
    const call = (signer.signTypedData as ReturnType<typeof vi.fn>).mock.calls[0][0];

    expect(call.domain.name).toBe("HyperliquidSignTransaction");
    expect(call.domain.version).toBe("1");
    expect(call.domain.chainId).toBe(999);
    expect(call.primaryType).toBe("HyperliquidTransaction:SendAsset");
    expect(call.message.hyperliquidChain).toBe("Mainnet");
    expect(call.message.destination).toBe(requirements.payTo);
    expect(call.message.sourceDex).toBe("spot");
    expect(call.message.destinationDex).toBe("spot");
    expect(call.message.token).toBe(requirements.asset);
    expect(call.message.amount).toBe(requirements.amount);
    expect(call.message.fromSubAccount).toBe("");
  });

  it("should use Testnet chain name for testnet network", async () => {
    const signer = createMockSigner();
    const scheme = new ExactHyperliquidScheme(signer);
    const requirements = createRequirements({ network: "hyperliquid:testnet" });

    await scheme.createPaymentPayload(2, requirements);

    const call = (signer.signTypedData as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.message.hyperliquidChain).toBe("Testnet");
  });

  it("should throw for unsupported network", async () => {
    const signer = createMockSigner();
    const scheme = new ExactHyperliquidScheme(signer);
    const requirements = createRequirements({ network: "eip155:1" });

    await expect(scheme.createPaymentPayload(2, requirements)).rejects.toThrow(
      "Unsupported network",
    );
  });

  it("should parse signature into r, s, v components", async () => {
    const r = "aa".repeat(32);
    const s = "bb".repeat(32);
    const v = "1c"; // 28

    const signer = createMockSigner();
    (signer.signTypedData as ReturnType<typeof vi.fn>).mockResolvedValue(`0x${r}${s}${v}`);

    const scheme = new ExactHyperliquidScheme(signer);
    const requirements = createRequirements();

    const result = await scheme.createPaymentPayload(2, requirements);
    const payload = result.payload as Record<string, unknown>;
    const sig = payload.signature as { r: string; s: string; v: number };

    expect(sig.r).toBe(`0x${r}`);
    expect(sig.s).toBe(`0x${s}`);
    expect(sig.v).toBe(28);
  });

  it("should use destinationDex from requirements.extra", async () => {
    const signer = createMockSigner();
    const scheme = new ExactHyperliquidScheme(signer);
    const requirements = createRequirements({ extra: { destinationDex: "" } });

    const result = await scheme.createPaymentPayload(2, requirements);
    const payload = result.payload as Record<string, unknown>;
    const action = payload.action as Record<string, unknown>;

    expect(action.destinationDex).toBe("");
  });

  it("should use custom sourceDex from constructor", async () => {
    const signer = createMockSigner();
    const scheme = new ExactHyperliquidScheme(signer, "");
    const requirements = createRequirements();

    const result = await scheme.createPaymentPayload(2, requirements);
    const payload = result.payload as Record<string, unknown>;
    const action = payload.action as Record<string, unknown>;

    expect(action.sourceDex).toBe("");
  });
});
