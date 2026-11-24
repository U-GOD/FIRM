import { existsSync, readFileSync } from "node:fs";
import { createClient, deriveUnifiedAccount, fetchEvmWindow } from "@qorechain/sdk";

const REST = "https://api-testnet.qore.host";

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

/**
 * The hybrid deposit of 1 base unit. Returns a one-line result and does not
 * broadcast when the maker has no QOR. A hash is printed only after a call lands.
 */
export async function reportDeposit(): Promise<string> {
  loadEnvFile();
  const mnemonic = process.env.MAKER_MNEMONIC?.trim();
  if (!mnemonic) return "deposit: not run, no maker key in the environment";

  const account = await deriveUnifiedAccount(mnemonic);
  const client = createClient({ network: "testnet" });
  const balances = await client.rest.getAllBalances(account.cosmos);
  const uqor = balances.balances.find((coin) => coin.denom === "uqor")?.amount ?? "0";
  const window = await fetchEvmWindow({ rest: REST, address: account.cosmos });

  if (uqor === "0") {
    return [
      "deposit: not run, maker has no QOR",
      `maker ${account.cosmos}`,
      `evm ${account.evm}`,
      `window found=${window.found} live=${window.live}`,
    ].join("; ");
  }

  throw new Error(
    `maker ${account.cosmos} has ${uqor} uqor, but no throwaway contract is deployed and the book is not deployed, so the 1-unit deposit was not sent`,
  );
}
