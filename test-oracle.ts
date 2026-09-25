import { Contract, rpc, Account, TransactionBuilder, Asset } from "@stellar/stellar-sdk";

async function testOracle() {
  try {
    const rpcUrl = 'https://practical-hidden-panorama.stellar-testnet.quiknode.pro/c8c8a5951a28c89a4cb3fd4a277b5eb22e685430';
    const networkPassphrase = 'Test SDF Network ; September 2015';
    const contractId = 'CCYOZJCOPG34LLQQ7N24YXBM7LL62R7ONMZ3G6WZAAYPB5OYKOMJRN63';
    
    const server = new rpc.Server(rpcUrl);
    const contract = new Contract(contractId);
    
    // XLM
    const xlmAsset = Asset.native();
    const xlmSac = xlmAsset.contractId(networkPassphrase);
    
    console.log("XLM SAC Address:", xlmSac);
    
    const { xdr } = require('@stellar/stellar-sdk');
    const otherSym = xdr.ScVal.scvSymbol("Other");
    const assetName = xdr.ScVal.scvSymbol("USDC");
    const param = xdr.ScVal.scvVec([otherSym, assetName]);

    const sourceAccount = new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0");
    const tx = new TransactionBuilder(sourceAccount, { fee: "100", networkPassphrase })
      .addOperation(contract.call("lastprice", param))
      .setTimeout(30)
      .build();

    const result = await server.simulateTransaction(tx);
    console.log("Simulation Result for XLM:");
    if (rpc.Api.isSimulationSuccess(result)) {
      console.log("SUCCESS!", result.result);
    } else if (rpc.Api.isSimulationError(result)) {
      console.log("ERROR:", result.error);
    } else {
      console.log("FAILED:", result);
    }
  } catch (err: any) {
    console.error("Crash:", err.message);
  }
}

testOracle();
