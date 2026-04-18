'use strict';

const { ethers } = require('ethers');
const solc        = require('solc');
const fs          = require('fs');
const path        = require('path');

const RPC_URL         = process.env.RPC_URL      || 'http://localhost:8545';
const DEPLOYER_KEY    = process.env.DEPLOYER_KEY;
const CONTRACT_SOURCE = path.resolve(__dirname, '../contracts/HABERegistry.sol');
const DEPLOY_OUT      = path.resolve(__dirname, '../config/deployment.json');

function compile() {
  console.log('[deploy] Compiling HABERegistry.sol...');
  const source = fs.readFileSync(CONTRACT_SOURCE, 'utf8');
  const input = {
    language: 'Solidity',
    sources: { 'HABERegistry.sol': { content: source } },
    settings: {
      evmVersion: 'london',       /* avoid push0 (Shanghai opcode) */
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
      optimizer: { enabled: true, runs: 200 },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  if (output.errors) {
    const errors = output.errors.filter(e => e.severity === 'error');
    if (errors.length) { errors.forEach(e => console.error(e.formattedMessage)); throw new Error('Compile failed'); }
    output.errors.forEach(e => console.warn('[solc warn]', e.formattedMessage));
  }
  const contract = output.contracts['HABERegistry.sol']['HABERegistry'];
  console.log('[deploy] Compilation successful.');
  return { abi: contract.abi, bytecode: '0x' + contract.evm.bytecode.object };
}

async function deploy() {
  const { abi, bytecode } = compile();
  console.log(`[deploy] Connecting to Besu at ${RPC_URL}...`);
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const network  = await provider.getNetwork();
  console.log(`[deploy] Connected. chainId=${network.chainId}`);
  const wallet   = new ethers.Wallet(DEPLOYER_KEY, provider);
  console.log(`[deploy] Deployer: ${wallet.address}`);
  const balance  = await provider.getBalance(wallet.address);
  console.log(`[deploy] Balance: ${ethers.formatEther(balance)} ETH`);
  console.log('[deploy] Deploying HABERegistry...');
  const factory  = new ethers.ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  const address  = await contract.getAddress();
  const receipt  = await provider.getTransactionReceipt(contract.deploymentTransaction().hash);
  console.log(`[deploy] Contract deployed at: ${address}`);
  console.log(`[deploy] Block: ${receipt.blockNumber}, Gas used: ${receipt.gasUsed}`);
  const deployment = { address, abi, chainId: network.chainId.toString(), blockNumber: receipt.blockNumber, deployer: wallet.address, timestamp: new Date().toISOString() };
  fs.writeFileSync(DEPLOY_OUT, JSON.stringify(deployment, null, 2));
  console.log(`[deploy] Deployment saved to ${DEPLOY_OUT}`);
}

deploy().catch(err => { console.error('[deploy] Fatal:', err.message); process.exit(1); });
