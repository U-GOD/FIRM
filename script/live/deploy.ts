import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Registry, type EncodeObject } from "@cosmjs/proto-signing";
import { StargateClient } from "@cosmjs/stargate";
import { MsgSend } from "cosmjs-types/cosmos/bank/v1beta1/tx";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
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
  bank,
  buildRegisterPqcKeyMsg,
  calculateFee,
  closeEvmWindowMsg,
  createClient,
  deriveUnifiedAccount,
  exactHybridGas,
  fetchEvmWindow,
  fetchPqcStatus,
  generateMnemonic,
  openEvmWindowMsg,
  qorechainRegistryTypes,
  signProofOfPossession,
  type UnifiedAccount,
} from "@qorechain/sdk";
import { diana } from "./chain.js";
import { DIANA_RPC, FETH, FUSD } from "./message.js";

const REST = "https://api-testnet.qore.host";
const CHAIN_ID = "qorechain-diana";
const STATE_PATH = "broadcast/deploy.json";
const GAS_FUND = "15000000";
const MAX_FEE_PER_GAS = 200_000_000_000n;

const bookAbi = [
  {
    type: "function",
    name: "tokenA",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "tokenB",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "nextId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

type State = {
  fund?: string;
  register?: string;
  open?: string;
  deploy?: string;
  book?: Address;
  close?: string;
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

function remember(name: string, value: string): void {
  const current = existsSync(".env") ? readFileSync(".env", "utf8") : "";
  if (new RegExp(`^${name}=`, "m").test(current)) return;
  appendFileSync(".env", `${current.endsWith("\n") || current.length === 0 ? "" : "\n"}${name}="${value}"\n`);
}

function loadState(): State {
  if (!existsSync(STATE_PATH)) return {};
  return JSON.parse(readFileSync(STATE_PATH, "utf8")) as State;
}

function saveState(state: State): void {
  mkdirSync("broadcast", { recursive: true });
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
}

async function accountSeq(rest: RestClient, address: string): Promise<{ accountNumber: bigint; sequence: bigint }> {
  const body = await rest.get<{ account?: { account_number?: string; sequence?: string } }>(
    `/cosmos/auth/v1beta1/accounts/${address}`,
  );
  if (!body.account?.account_number) throw new Error(`${address} is not on chain`);
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
  account: UnifiedAccount,
  messages: readonly EncodeObject[],
  signMode: "hybrid" | "classical",
): Promise<string> {
  const rest = new RestClient(REST);
  const { accountNumber, sequence } = await accountSeq(rest, account.cosmos);
  const types = new Registry(qorechainRegistryTypes);
  types.register("/cosmos.bank.v1beta1.MsgSend", MsgSend);
  const signer = new EthNativeSigner(account, {
    rest: REST,
    signMode,
    registry: types,
  });
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

function weiToUqorCeil(wei: bigint): bigint {
  const unit = 10n ** 12n;
  return (wei + unit - 1n) / unit;
}

async function main(): Promise<void> {
  loadEnvFile();
  const makerPhrase = process.env.MAKER_MNEMONIC?.trim();
  if (!makerPhrase) throw new Error("MAKER_MNEMONIC is not set");
  if (!process.env.DEPLOYER_MNEMONIC?.trim()) {
    const created = generateMnemonic();
    remember("DEPLOYER_MNEMONIC", created);
    process.env.DEPLOYER_MNEMONIC = created;
  }
  const maker = await deriveUnifiedAccount(makerPhrase);
  const deployer = await deriveUnifiedAccount(process.env.DEPLOYER_MNEMONIC!.trim());
  console.log(`deployer ${deployer.cosmos} ${deployer.evm}`);

  const client = createClient({ network: "testnet" });
  if (client.network.chainId !== CHAIN_ID) throw new Error(`client chain is ${client.network.chainId}`);
  const state = loadState();
  const transport = await StargateClient.connect(client.network.endpoints.rpc);
  const publicClient = createPublicClient({ chain: diana, transport: http(DIANA_RPC) });
  const wallet = createWalletClient({
    account: privateKeyToAccount(deployer.privateKey as Hex),
    chain: diana,
    transport: http(DIANA_RPC),
  });

  try {
    const balances = await client.rest.getAllBalances(deployer.cosmos);
    const uqor = balances.balances.find((coin) => coin.denom === "uqor")?.amount ?? "0";
    const inventory = balances.balances.filter((coin) => coin.denom !== "uqor");
    if (inventory.length > 0) throw new Error("deployer already holds a non-QOR balance");
    if (uqor === "0") {
      state.fund = await send(
        transport,
        maker,
        [
          bank.send({
            fromAddress: maker.cosmos,
            toAddress: deployer.cosmos,
            amount: [{ denom: "uqor", amount: GAS_FUND }],
          }),
        ],
        "hybrid",
      );
      saveState(state);
      console.log(`funded ${state.fund}`);
    }

    const status = await fetchPqcStatus({ rest: REST, address: deployer.cosmos });
    if (!status.registered) {
      const proof = signProofOfPossession({
        chainId: CHAIN_ID,
        account: deployer.cosmos,
        algorithmId: 1,
        keypair: deployer.pqc,
      });
      state.register = await send(
        transport,
        deployer,
        [
          buildRegisterPqcKeyMsg(deployer.cosmos, {
            pqcKeypair: deployer.pqc,
            ecdsaPubkey: hexToBytes(deployer.publicKey as Hex),
            keyType: "hybrid",
            proofOfPossession: proof,
          }),
        ],
        "classical",
      );
      saveState(state);
      console.log(`registered ${state.register}`);
    }
    const proven = await fetchPqcStatus({ rest: REST, address: deployer.cosmos });
    if (!proven.registered || proven.possessionProven !== true) {
      throw new Error(`deployer key is not possession-proven (registered=${proven.registered})`);
    }

    if (!state.book) {
      const artifact = JSON.parse(readFileSync("out/OfferBook.sol/OfferBook.json", "utf8")) as {
        abi: readonly unknown[];
        bytecode: { object: Hex };
      };
      const gas = 6_000_000n;
      const maxValue = (weiToUqorCeil(gas * MAX_FEE_PER_GAS) * 2n).toString();
      state.open = await send(
        transport,
        deployer,
        [openEvmWindowMsg({ sender: deployer.cosmos, blocks: 120, maxTxs: 1, maxValue })],
        "hybrid",
      );
      saveState(state);
      console.log(`window opened ${state.open}`);
      const opened = await fetchEvmWindow({ rest: REST, address: deployer.cosmos });
      if (!opened.live) throw new Error("deployer window did not go live");

      try {
        const deployHash = await wallet.deployContract({
          abi: artifact.abi,
          bytecode: artifact.bytecode.object,
          args: [FETH, FUSD],
          gas,
          maxFeePerGas: MAX_FEE_PER_GAS,
          maxPriorityFeePerGas: 12_500_000_000n,
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
        if (receipt.status !== "success" || !receipt.contractAddress) {
          throw new Error(`deploy failed: ${deployHash}`);
        }
        state.deploy = deployHash;
        state.book = receipt.contractAddress;
        saveState(state);
        console.log(`book ${state.book} deploy ${deployHash}`);
      } finally {
        const window = await fetchEvmWindow({ rest: REST, address: deployer.cosmos });
        if (window.found) {
          state.close = await send(transport, deployer, [closeEvmWindowMsg(deployer.cosmos)], "hybrid");
          saveState(state);
          console.log(`window closed ${state.close}`);
        }
      }
    }

    const stored = await fetchEvmWindow({ rest: REST, address: deployer.cosmos });
    if (stored.found && !state.close) {
      state.close = await send(transport, deployer, [closeEvmWindowMsg(deployer.cosmos)], "hybrid");
      saveState(state);
      console.log(`window closed ${state.close}`);
    }

    const book = state.book;
    if (!book) throw new Error("book address is missing");
    const [tokenA, tokenB, nextId] = await Promise.all([
      publicClient.readContract({ address: book, abi: bookAbi, functionName: "tokenA" }),
      publicClient.readContract({ address: book, abi: bookAbi, functionName: "tokenB" }),
      publicClient.readContract({ address: book, abi: bookAbi, functionName: "nextId" }),
    ]);
    if (getAddress(tokenA) !== FETH || getAddress(tokenB) !== FUSD || nextId !== 1n) {
      throw new Error(`status read mismatch: tokenA ${tokenA}, tokenB ${tokenB}, nextId ${nextId}`);
    }
    const window = await fetchEvmWindow({ rest: REST, address: deployer.cosmos });
    if (window.found || window.live) {
      throw new Error(`deployer window is still open (found=${window.found} live=${window.live})`);
    }
    remember("BOOK_ADDRESS", book);
    console.log(
      `deployed ${book}; tokenA ${tokenA}; tokenB ${tokenB}; nextId ${nextId}; window found=${window.found} live=${window.live}`,
    );
  } finally {
    transport.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
