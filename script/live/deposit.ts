import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Registry, type EncodeObject, type GeneratedType } from "@cosmjs/proto-signing";
import { StargateClient } from "@cosmjs/stargate";
import { BinaryWriter } from "cosmjs-types/binary";
import { Coin } from "cosmjs-types/cosmos/base/v1beta1/coin";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  hexToBytes,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  DEFAULT_GAS_PRICE,
  EthNativeSigner,
  RestClient,
  calculateFee,
  closeEvmWindowMsg,
  createClient,
  crossvm,
  deriveUnifiedAccount,
  exactHybridGas,
  fetchEvmWindow,
  fetchPqcStatus,
  openEvmWindowMsg,
  qorechainRegistryTypes,
  signProofOfPossession,
  buildRegisterPqcKeyMsg,
  type UnifiedAccount,
} from "@qorechain/sdk";
import { diana } from "./chain.js";
import { DIANA_RPC, FETH } from "./message.js";

const REST = "https://api-testnet.qore.host";
const CHAIN_ID = "qorechain-diana";
const CONVERT_TYPE = "/cosmos.evm.erc20.v1.MsgConvertCoin";
const FETH_DENOM = "erc20:0x02292293c13880a26242690eb70a0e42B8E91c28";
const STATE_PATH = "broadcast/deposit-spike.json";
const ONE = 1n;

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

const vaultAbi = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

type State = {
  register?: string;
  convert?: string;
  open?: string;
  vault?: Address;
  close?: string;
  approve?: string;
  deposit?: string;
  clear?: string;
};

const convertType: GeneratedType = {
  encode(message: { coin: { denom: string; amount: string }; receiver: string; sender: string }, writer = new BinaryWriter()) {
    const coin = Coin.encode(Coin.fromPartial(message.coin)).finish();
    writer.uint32(10).bytes(coin);
    writer.uint32(18).string(message.receiver);
    writer.uint32(26).string(message.sender);
    return writer;
  },
  decode() {
    throw new Error("MsgConvertCoin decode is unused");
  },
  fromPartial(object: { coin: { denom: string; amount: string }; receiver: string; sender: string }) {
    return object;
  },
};

function loadEnvFile(): void {
  if (!existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function loadState(): State {
  if (!existsSync(STATE_PATH)) return {};
  return JSON.parse(readFileSync(STATE_PATH, "utf8")) as State;
}

function saveState(state: State): void {
  mkdirSync("broadcast", { recursive: true });
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
}

function registry(): Registry {
  const created = new Registry(qorechainRegistryTypes);
  created.register(CONVERT_TYPE, convertType);
  return created;
}

async function accountSeq(rest: RestClient, address: string): Promise<{ accountNumber: bigint; sequence: bigint }> {
  const body = await rest.get<{ account?: { account_number?: string; sequence?: string } }>(
    `/cosmos/auth/v1beta1/accounts/${address}`,
  );
  if (!body.account?.account_number) throw new Error("maker account is not on chain");
  return {
    accountNumber: BigInt(body.account.account_number),
    sequence: BigInt(body.account.sequence ?? "0"),
  };
}

async function simulate(txRawBytes: Uint8Array): Promise<number> {
  const response = await fetch(`${REST}/cosmos/tx/v1beta1/simulate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tx_bytes: Buffer.from(txRawBytes).toString("base64") }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`simulate ${response.status}: ${text.slice(0, 800)}`);
  const body = JSON.parse(text) as { gas_info?: { gas_used?: string } };
  const used = Number(body.gas_info?.gas_used ?? "");
  if (!Number.isSafeInteger(used) || used <= 0) throw new Error(`simulate returned no gas_used: ${text.slice(0, 400)}`);
  return used;
}

async function send(
  transport: StargateClient,
  maker: UnifiedAccount,
  messages: readonly EncodeObject[],
  signMode: "hybrid" | "classical",
  types: Registry,
): Promise<string> {
  const rest = new RestClient(REST);
  const { accountNumber, sequence } = await accountSeq(rest, maker.cosmos);
  const signer = new EthNativeSigner(maker, { rest: REST, signMode, registry: types });
  const signBytesVersion = signMode === "hybrid" ? await signer.resolveSignBytesVersion(CHAIN_ID) : undefined;
  const probe = signer.sign({
    chainId: CHAIN_ID,
    accountNumber,
    sequence,
    messages,
    fee: calculateFee(5_000_000, DEFAULT_GAS_PRICE),
    signBytesVersion,
  });
  const gas = exactHybridGas(await simulate(probe.txRawBytes));
  const result = await signer.signAndBroadcast(transport, {
    chainId: CHAIN_ID,
    accountNumber,
    sequence,
    messages,
    fee: calculateFee(gas, DEFAULT_GAS_PRICE),
    signBytesVersion,
  });
  return result.transactionHash;
}

function evmCall(sender: string, target: Address, data: Hex): EncodeObject {
  return crossvm.crossVmCall({
    sender,
    sourceVm: "cosmwasm",
    targetVm: "evm",
    targetContract: target,
    payload: hexToBytes(data),
    funds: [],
    async: false,
    asyncGasLimit: "0",
    asyncMaxFactor: "0",
  });
}

async function hybridStatus(hash: string): Promise<string> {
  const response = await fetch(`${REST}/cosmos/tx/v1beta1/txs/${hash}`);
  if (!response.ok) throw new Error(`tx ${hash} query failed: ${response.status}`);
  const body = (await response.json()) as {
    tx_response?: { code?: number; events?: { type?: string; attributes?: { key?: string; value?: string }[] }[] };
  };
  if (body.tx_response?.code !== 0) throw new Error(`tx ${hash} code ${body.tx_response?.code}`);
  const event = body.tx_response.events?.find((item) => item.type === "pqc_hybrid_verify");
  const status = event?.attributes?.find((item) => item.key === "status")?.value;
  if (!status) throw new Error(`tx ${hash} has no pqc_hybrid_verify status`);
  return status;
}

/**
 * Hybrid deposit of 1 base unit of fETH into a throwaway vault.
 * Does not broadcast when the maker has no QOR.
 */
export async function reportDeposit(): Promise<string> {
  loadEnvFile();
  const mnemonic = process.env.MAKER_MNEMONIC?.trim();
  if (!mnemonic) return "deposit: not run, no maker key in the environment";

  const maker = await deriveUnifiedAccount(mnemonic);
  const client = createClient({ network: "testnet" });
  if (client.network.chainId !== CHAIN_ID) throw new Error(`client chain is ${client.network.chainId}`);
  const balances = await client.rest.getAllBalances(maker.cosmos);
  const uqor = balances.balances.find((coin) => coin.denom === "uqor")?.amount ?? "0";
  if (uqor === "0") {
    const window = await fetchEvmWindow({ rest: REST, address: maker.cosmos });
    return `deposit: not run, maker has no QOR; maker ${maker.cosmos}; evm ${maker.evm}; window found=${window.found} live=${window.live}`;
  }

  const state = loadState();
  const types = registry();
  const transport = await StargateClient.connect(client.network.endpoints.rpc);
  const publicClient = createPublicClient({ chain: diana, transport: http(DIANA_RPC) });
  const wallet = createWalletClient({
    account: privateKeyToAccount(maker.privateKey as Hex),
    chain: diana,
    transport: http(DIANA_RPC),
  });

  try {
    const status = await fetchPqcStatus({ rest: REST, address: maker.cosmos });
    if (!status.registered) {
      const proof = signProofOfPossession({
        chainId: CHAIN_ID,
        account: maker.cosmos,
        algorithmId: 1,
        keypair: maker.pqc,
      });
      state.register = await send(
        transport,
        maker,
        [
          buildRegisterPqcKeyMsg(maker.cosmos, {
            pqcKeypair: maker.pqc,
            ecdsaPubkey: hexToBytes(maker.publicKey as Hex),
            keyType: "hybrid",
            proofOfPossession: proof,
          }),
        ],
        "classical",
        types,
      );
      saveState(state);
      console.log(`registered ${state.register}`);
    }
    const proven = await fetchPqcStatus({ rest: REST, address: maker.cosmos });
    if (!proven.registered || proven.possessionProven !== true) {
      throw new Error(`maker key is not possession-proven (registered=${proven.registered})`);
    }

    const erc20 = await publicClient.readContract({
      address: FETH,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [maker.evm],
    });
    if (erc20 < ONE && !state.convert) {
      state.convert = await send(
        transport,
        maker,
        [
          {
            typeUrl: CONVERT_TYPE,
            value: {
              coin: { denom: FETH_DENOM, amount: "1" },
              receiver: maker.evm.toLowerCase(),
              sender: maker.cosmos,
            },
          },
        ],
        "hybrid",
        types,
      );
      saveState(state);
      console.log(`converted ${state.convert}`);
    }

    if (!state.vault) {
      const open = openEvmWindowMsg({
        sender: maker.cosmos,
        blocks: 200,
        maxTxs: 1,
        maxValue: "10000000",
      });
      state.open = await send(transport, maker, [open], "hybrid", types);
      saveState(state);
      console.log(`window opened ${state.open}`);
      const opened = await fetchEvmWindow({ rest: REST, address: maker.cosmos });
      if (!opened.live) throw new Error("window did not go live after the open transaction");

      const artifact = JSON.parse(readFileSync("out/SpikeVault.sol/SpikeVault.json", "utf8")) as {
        bytecode: { object: Hex };
      };
      const deployHash = await wallet.deployContract({
        abi: vaultAbi,
        bytecode: artifact.bytecode.object,
        gas: 1_500_000n,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
      if (receipt.status !== "success" || !receipt.contractAddress) {
        throw new Error(`vault deploy failed: ${deployHash}`);
      }
      state.vault = receipt.contractAddress;
      saveState(state);
      console.log(`vault ${state.vault} deploy ${deployHash}`);

      state.close = await send(transport, maker, [closeEvmWindowMsg(maker.cosmos)], "hybrid", types);
      saveState(state);
      console.log(`window closed ${state.close}`);
    }

    const window = await fetchEvmWindow({ rest: REST, address: maker.cosmos });
    if (window.live) throw new Error("maker window is still live; the deposit was not sent");

    const vault = state.vault;
    if (!vault) throw new Error("vault address is missing");
    const code = await publicClient.getCode({ address: vault });
    if (!code || code === "0x") throw new Error(`vault ${vault} has no code`);

    const allowance = await publicClient.readContract({
      address: FETH,
      abi: erc20Abi,
      functionName: "allowance",
      args: [maker.evm, vault],
    });
    if (allowance < ONE && !state.deposit) {
      state.approve = await send(
        transport,
        maker,
        [evmCall(maker.cosmos, FETH, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [vault, ONE] }))],
        "hybrid",
        types,
      );
      saveState(state);
      console.log(`approved ${state.approve}`);
    }

    if (!state.deposit) {
      state.deposit = await send(
        transport,
        maker,
        [evmCall(maker.cosmos, vault, encodeFunctionData({ abi: vaultAbi, functionName: "deposit", args: [FETH, ONE] }))],
        "hybrid",
        types,
      );
      saveState(state);
      console.log(`deposited ${state.deposit}`);
    }

    if (!state.clear) {
      state.clear = await send(
        transport,
        maker,
        [evmCall(maker.cosmos, FETH, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [vault, 0n] }))],
        "hybrid",
        types,
      );
      saveState(state);
      console.log(`allowance cleared ${state.clear}`);
    }

    const held = await publicClient.readContract({
      address: FETH,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [vault],
    });
    if (held < ONE) throw new Error(`vault holds ${held} base units, expected at least 1`);
    const verify = await hybridStatus(state.deposit);
    const after = await fetchEvmWindow({ rest: REST, address: maker.cosmos });
    return `deposit: ${state.deposit}; pqc_hybrid_verify ${verify}; vault ${vault}; window found=${after.found} live=${after.live}`;
  } finally {
    transport.disconnect();
  }
}
