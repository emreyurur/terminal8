import axios from 'axios';

async function testRpc(url: string) {
  try {
    const res = await axios.post(url, {
      jsonrpc: "2.0",
      id: 1,
      method: "getNetwork"
    }, { headers: { 'Content-Type': 'application/json' } });
    console.log(`Success on ${url}:`, res.data);
  } catch (err: any) {
    console.error(`Failed on ${url}:`, err.message, err.response?.status);
  }
}

async function run() {
  await testRpc('https://soroban-testnet.stellar.org');
  await testRpc('https://soroban-testnet.stellar.org/');
  await testRpc('https://soroban-rpc.testnet.stellar.gateway.fm');
  await testRpc('https://soroban-rpc.testnet.stellar.gateway.fm/');
  await testRpc('https://practical-hidden-panorama.stellar-testnet.quiknode.pro/c8c8a5951a28c89a4cb3fd4a277b5eb22e685430');
}

run();
