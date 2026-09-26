import { Asset, Address, xdr } from "@stellar/stellar-sdk";

/**
 * Stellar klasik varlığını (Code + Issuer) Soroban SAC kontrat adresine çevirir.
 * SAC adresi deterministiktir: aynı asset + aynı network = her zaman aynı contract ID.
 */
export function resolveSacAddress(
  code: string,
  issuer: string | null,
  networkPassphrase: string,
): string {
  const asset = issuer ? new Asset(code, issuer) : Asset.native();

  // SAC contract ID = SHA256(networkIdHash + "contract_from_asset" preimage + asset XDR)
  // Stellar SDK'nın asset.contractId(networkPassphrase) metodu bunu yapar:
  return asset.contractId(networkPassphrase);
}

// Reflector'a parametre olarak geçilecek format: SEP-40 Asset enum'u.
// Enum: Asset::Stellar(Address) veya Asset::Other(Symbol)
export function toReflectorParam(
  sacAddress: string,
  assetCode: string,
  isMainnet: boolean,
): xdr.ScVal {
  if (!isMainnet) {
    const otherSym = xdr.ScVal.scvSymbol("Other");
    const assetName = xdr.ScVal.scvSymbol(assetCode);
    return xdr.ScVal.scvVec([otherSym, assetName]);
  }
  const stellarSym = xdr.ScVal.scvSymbol("Stellar");
  const addressVal = xdr.ScVal.scvAddress(
    Address.fromString(sacAddress).toScAddress(),
  );
  return xdr.ScVal.scvVec([stellarSym, addressVal]);
}
