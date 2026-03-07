import { describe, expect, it } from "vitest";
import { ExactHyperliquidScheme } from "../../src/exact/server/scheme";
import type { PaymentRequirements } from "@x402/core/types";

describe("ExactHyperliquidScheme (server)", () => {
  const scheme = new ExactHyperliquidScheme();

  describe("parsePrice", () => {
    it("should pass through AssetAmount directly", async () => {
      const result = await scheme.parsePrice(
        { amount: "5.0", asset: "HYPE:0xdeadbeef" },
        "hyperliquid:mainnet",
      );
      expect(result.amount).toBe("5.0");
      expect(result.asset).toBe("HYPE:0xdeadbeef");
    });

    it("should convert dollar string to USDC", async () => {
      const result = await scheme.parsePrice("$1.50", "hyperliquid:mainnet");
      expect(result.amount).toBe("1.5");
      expect(result.asset).toBe("USDC:0x6d1e7cde53ba9467b783cb7c530ce054");
    });

    it("should convert number to USDC", async () => {
      const result = await scheme.parsePrice(0.1, "hyperliquid:mainnet");
      expect(result.amount).toBe("0.1");
      expect(result.asset).toBe("USDC:0x6d1e7cde53ba9467b783cb7c530ce054");
    });

    it("should throw on invalid money format", async () => {
      await expect(scheme.parsePrice("invalid", "hyperliquid:mainnet")).rejects.toThrow(
        "Invalid money format",
      );
    });

    it("should use custom money parser when registered", async () => {
      const customScheme = new ExactHyperliquidScheme();
      customScheme.registerMoneyParser(async (amount, _network) => {
        return { amount: (amount * 100).toString(), asset: "CUSTOM:0x123" };
      });

      const result = await customScheme.parsePrice(1.5, "hyperliquid:mainnet");
      expect(result.amount).toBe("150");
      expect(result.asset).toBe("CUSTOM:0x123");
    });

    it("should fall back to default when custom parser returns null", async () => {
      const customScheme = new ExactHyperliquidScheme();
      customScheme.registerMoneyParser(async () => null);

      const result = await customScheme.parsePrice("$0.50", "hyperliquid:mainnet");
      expect(result.amount).toBe("0.5");
      expect(result.asset).toBe("USDC:0x6d1e7cde53ba9467b783cb7c530ce054");
    });
  });

  describe("enhancePaymentRequirements", () => {
    it("should return requirements unchanged", async () => {
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "hyperliquid:mainnet",
        asset: "USDC:0x6d1e7cde53ba9467b783cb7c530ce054",
        amount: "1.5",
        payTo: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
        maxTimeoutSeconds: 60,
        extra: {},
      };

      const result = await scheme.enhancePaymentRequirements(
        requirements,
        { x402Version: 2, scheme: "exact", network: "hyperliquid:mainnet" },
        [],
      );

      expect(result).toEqual(requirements);
    });
  });
});
