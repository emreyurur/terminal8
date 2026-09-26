/**
 * Network-aware constants that differ between Stellar Mainnet and Testnet.
 * All network-specific hardcoded values should live here.
 */

const MAINNET_PASSPHRASE = "Public Global Stellar Network ; September 2015";

export interface NetworkConstants {
  readonly isMainnet: boolean;
  readonly usdc: { readonly code: string; readonly issuer: string };
  readonly reflectorContractId: string;
  readonly sorobanRpcUrl: string;
}

const MAINNET_CONSTANTS: NetworkConstants = {
  isMainnet: true,
  usdc: {
    code: "USDC",
    issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  },
  reflectorContractId:
    "CALI2BYU2JE6WVRUFYTS6MSBNEHGJ35P4AVCZYF3B6QOE3QKOB2PLE6M",
  sorobanRpcUrl: "https://mainnet.sorobanrpc.com",
};

const TESTNET_CONSTANTS: NetworkConstants = {
  isMainnet: false,
  usdc: {
    code: "USDC",
    issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  },
  reflectorContractId:
    "CAVLP5DH2GJPZMVO7IJY4CVOD5MWEFTJFVPD2YY2FQXOQHRGHK4D6HLP",
  sorobanRpcUrl: "https://soroban-testnet.stellar.org:443",
};

export function resolveNetworkConstants(
  networkPassphrase: string,
): NetworkConstants {
  return networkPassphrase === MAINNET_PASSPHRASE
    ? MAINNET_CONSTANTS
    : TESTNET_CONSTANTS;
}
