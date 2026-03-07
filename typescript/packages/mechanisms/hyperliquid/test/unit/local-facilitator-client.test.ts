import { describe, expect, it } from "vitest";
import { LocalHyperliquidFacilitatorClient } from "../../src/local-facilitator-client";

describe("LocalHyperliquidFacilitatorClient", () => {
  it("should return supported kinds for registered networks", async () => {
    const client = new LocalHyperliquidFacilitatorClient({
      networks: ["hyperliquid:mainnet"],
    });

    const supported = await client.getSupported();
    expect(supported.kinds).toHaveLength(1);
    expect(supported.kinds[0].scheme).toBe("exact");
    expect(supported.kinds[0].network).toBe("hyperliquid:mainnet");
    expect(supported.kinds[0].x402Version).toBe(2);
  });

  it("should support multiple networks", async () => {
    const client = new LocalHyperliquidFacilitatorClient({
      networks: ["hyperliquid:mainnet", "hyperliquid:testnet"],
    });

    const supported = await client.getSupported();
    expect(supported.kinds).toHaveLength(2);

    const networks = supported.kinds.map(k => k.network);
    expect(networks).toContain("hyperliquid:mainnet");
    expect(networks).toContain("hyperliquid:testnet");
  });

  it("should return empty signers (gasless, no facilitator signer needed)", async () => {
    const client = new LocalHyperliquidFacilitatorClient({
      networks: ["hyperliquid:mainnet"],
    });

    const supported = await client.getSupported();
    const signerValues = Object.values(supported.signers);
    // Either empty object or all arrays are empty
    expect(signerValues.every(arr => arr.length === 0)).toBe(true);
  });
});
