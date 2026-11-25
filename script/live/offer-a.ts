import { closeEvmWindowMsg, fetchEvmWindow, openEvmWindowMsg } from "@qorechain/sdk";
import { runAttacker } from "./attacker.js";
import {
  ATTACK_FEE,
  ATTACK_GAS,
  FETH_TOKEN,
  REST,
  bookAbi,
  bookAddress,
  accounts,
  confirm,
  connect,
  loadEnvFile,
  loadState,
  publicClient,
  saveState,
  send,
  type Live,
} from "./book.js";
import { runFill } from "./fill.js";
import { OFFER_A_AMOUNT } from "./message.js";
import { runOpen } from "./open.js";

function attackMaxValue(txs: number): string {
  const unit = 10n ** 12n;
  const perTx = (ATTACK_GAS * ATTACK_FEE + unit - 1n) / unit;
  // The chain subtracts each transaction's maximum fee from one shared budget.
  return (perTx * BigInt(txs) * 2n).toString();
}

async function ensureAttackWindow(live: Live): Promise<void> {
  const { transport, maker, state, save } = live;
  let window = await fetchEvmWindow({ rest: REST, address: maker.cosmos });
  if (window.found && !window.live) {
    state.attackClose = await send(transport, maker, [closeEvmWindowMsg(maker.cosmos)], "hybrid");
    save();
    await confirm(state.attackClose, true);
    console.log(`stale attack window closed ${state.attackClose}`);
    window = await fetchEvmWindow({ rest: REST, address: maker.cosmos });
  }
  if (window.live) return;
  const remaining = [state.attackCancel, state.attackPrice, state.attackWithdraw].filter((hash) => !hash).length;
  state.attackWindow = await send(
    transport,
    maker,
    [openEvmWindowMsg({ sender: maker.cosmos, blocks: 200, maxTxs: remaining, maxValue: attackMaxValue(remaining) })],
    "hybrid",
  );
  save();
  await confirm(state.attackWindow, true);
  const opened = await fetchEvmWindow({ rest: REST, address: maker.cosmos });
  if (!opened.live) throw new Error("attack window did not go live");
  console.log(`attack window ${state.attackWindow}`);
}

async function closeAttackWindow(live: Live): Promise<void> {
  const { transport, maker, state, save } = live;
  const window = await fetchEvmWindow({ rest: REST, address: maker.cosmos });
  if (!window.found) return;
  state.attackClose = await send(transport, maker, [closeEvmWindowMsg(maker.cosmos)], "hybrid");
  save();
  await confirm(state.attackClose, true);
  console.log(`attack window closed ${state.attackClose}`);
}

async function main(): Promise<void> {
  loadEnvFile();
  const { maker, filler } = await accounts();
  console.log(`maker ${maker.cosmos} ${maker.evm}`);
  console.log(`filler ${filler.cosmos} ${filler.evm}`);
  const state = loadState();
  const save = () => saveState(state);
  const transport = await connect();
  const client = publicClient();
  const live: Live = { transport, publicClient: client, maker, filler, book: bookAddress(), state, save };
  try {
    await runOpen(live);
    const attacksDone = Boolean(state.attackCancel && state.attackPrice && state.attackWithdraw);
    if (!attacksDone) {
      await ensureAttackWindow(live);
      try {
        await runAttacker(live.book, BigInt(state.offerId ?? "0"), state, save);
      } finally {
        await closeAttackWindow(live);
      }
    }
    if (!state.fill) {
      const idle = await client.readContract({
        address: live.book,
        abi: bookAbi,
        functionName: "idle",
        args: [maker.evm as `0x${string}`, FETH_TOKEN],
      });
      const reserved = await client.readContract({
        address: live.book,
        abi: bookAbi,
        functionName: "reserved",
        args: [FETH_TOKEN],
      });
      if (idle !== 1n || reserved !== OFFER_A_AMOUNT) {
        throw new Error(`balances moved during the attack (idle ${idle}, reserved ${reserved})`);
      }
      console.log("attacker left idle at 1 base unit and reserved at the offer amount");
    }
    const closed = await fetchEvmWindow({ rest: REST, address: maker.cosmos });
    if (closed.found || closed.live) throw new Error(`maker window still stored (found=${closed.found} live=${closed.live})`);
    await runFill(live);
  } finally {
    transport.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
