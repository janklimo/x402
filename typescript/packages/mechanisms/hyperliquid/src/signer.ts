/**
 * Client signer for Hyperliquid payments.
 *
 * Only needs EIP-712 signTypedData capability. Any object with `address` and
 * `signTypedData` satisfies this type — including viem's `privateKeyToAccount()`:
 * ```typescript
 * const signer = privateKeyToAccount('0x...');
 * const scheme = new ExactHyperliquidScheme(signer);
 * ```
 */
export type ClientHyperliquidSigner = {
  readonly address: `0x${string}`;
  signTypedData(message: {
    domain: Record<string, unknown>;
    types: Record<string, unknown>;
    primaryType: string;
    message: Record<string, unknown>;
  }): Promise<`0x${string}`>;
};

/**
 * EIP-1193 provider interface (MetaMask, Rabby, WalletConnect, etc.)
 */
interface EIP1193Provider {
  request(args: { method: string; params: unknown[] }): Promise<unknown>;
}

/**
 * Creates a ClientHyperliquidSigner from a browser wallet connector.
 *
 * Handles EIP-712 signing via the raw EIP-1193 provider, which is necessary
 * because Hyperliquid uses a network-specific signing domain chainId that may
 * differ from what higher-level libraries (e.g., viem WalletClient) expect.
 * Also handles BigInt serialization for JSON-RPC transport.
 *
 * @param address - The wallet address
 * @param getProvider - Function that returns the raw EIP-1193 provider (e.g., `() => connector.getProvider()`)
 * @returns A ClientHyperliquidSigner
 *
 * @example
 * ```typescript
 * // With wagmi
 * const { address, connector } = useAccount();
 * const signer = fromBrowserWallet(address, () => connector.getProvider());
 *
 * const client = new x402Client();
 * client.register("hyperliquid:*", new ExactHyperliquidScheme(signer));
 * ```
 */
export function fromBrowserWallet(
  address: `0x${string}`,
  getProvider: () => Promise<unknown>,
): ClientHyperliquidSigner {
  return {
    address,
    signTypedData: async (msg) => {
      const provider = (await getProvider()) as EIP1193Provider;
      const typedData = JSON.stringify(
        {
          types: {
            EIP712Domain: [
              { name: "name", type: "string" },
              { name: "version", type: "string" },
              { name: "chainId", type: "uint256" },
              { name: "verifyingContract", type: "address" },
            ],
            ...msg.types,
          },
          primaryType: msg.primaryType,
          domain: msg.domain,
          message: msg.message,
        },
        (_, v) => (typeof v === "bigint" ? Number(v) : v),
      );
      return provider.request({
        method: "eth_signTypedData_v4",
        params: [address, typedData],
      }) as Promise<`0x${string}`>;
    },
  };
}
