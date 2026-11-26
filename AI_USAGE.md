# AI usage

A record of what an agent actually did. Dates are the day the work was checked.

## 23 November 2026

Tool: Cursor agent, Grok 4.7.

Task: Add a project skill for this build, and spike the offer bytes against Diana `pqcVerify`.

Files written: `.claude/skills/firm-build/SKILL.md`, `package.json`, `package-lock.json`, `tsconfig.json`, `foundry.toml`, `contracts/interfaces/IQorePQC.sol`, `contracts/libraries/OfferBytes.sol`, `script/live/chain.ts`, `script/live/message.ts`, `script/live/spike.ts`, `test/vectors/offer.json`, `docs/SPIKE.md`. `README.md` was updated with the token pin and the 6-decimal price example. `.gitignore` was added.

Kept: the `abi.encode` layout in `IMPLEMENTATION.md`. ML-DSA-87, empty context, deterministic signing (`extraEntropy: false` in `@noble/post-quantum` 0.5.4). The spike throws if `pqcVerify` returns empty data. fETH and fUSD were pinned only after `symbol()` and `decimals()` on Diana.

Rejected: installing the `claude-api` skill from `anthropics/skills`. That skill writes Anthropic SDK code, and this book does not call the Claude API. The installed skill is `.claude/skills/firm-build`, which tells the agent to follow `IMPLEMENTATION.md`. Also rejected: signing a hash instead of the raw payload, ML-KEM, and any deposit without a key.

Check: `npm run spike`. Noble accepted the offer, the cancel, and the withdraw. An `eth_call` to `0x…0a01` returned true for the offer signature and false after one flipped bit.

## 24 November 2026

Tool: Cursor agent, Grok 4.7.

Task: Curve, `OfferBook`, and the Forge tests. Deposit is still waiting on a maker key.

Files: `contracts/libraries/Curve.sol`, `contracts/libraries/OfferBytes.sol`, `contracts/OfferBook.sol`, `test/mocks/PqcMock.sol`, `test/mocks/TestTokens.sol`, `test/Curve.t.sol`, `test/OfferBytes.t.sol`, `test/OfferBook.t.sol`, `test/OfferBook.invariants.t.sol`, `foundry.toml`, `lib/forge-std`, `lib/openzeppelin-contracts`. `IMPLEMENTATION.md` now passes the maker into `withdraw`. `README.md` says a green Forge run is not FIPS 204.

Kept: the named tests, the mock rule `keccak256(abi.encode(pubkey, keccak256(message)))` inside a 4,627-byte signature, fail-closed empty precompile data, and the balance invariant. `withdraw` takes a maker argument because ML-DSA does not recover an address. The offer bytes are two `abi.encode` calls concatenated. One encode of all sixteen words overflowed the stack. The vector test shows the bytes still match. The book compiles with `via_ir`. A fee recipient cannot be the book, so output tokens cannot sit in the balance the invariant checks.

Rejected: calling the mock ML-DSA, and starting the hybrid deposit without a key.

Check: `forge test` on WSL, Forge 1.9.0. 32 tests passed, including the fuzz and `invariant_balance_matches_idle_plus_reserved`.

## 24 November 2026, deposit

Tool: Cursor agent, Grok 4.7.

Task: Start the deposit half of step 1. Confirm `MsgCrossVMCall` is still enabled, and stop before a broadcast if the maker has no QOR.

Files: `package.json`, `package-lock.json`, `.env.example`, `script/live/deposit.ts`, `script/live/spike.ts`, `docs/SPIKE.md`. The maker phrase was written to `.env` and was not committed.

Kept: `@qorechain/sdk` 0.14.0, a unified eth-native account (`deriveUnifiedAccount`), and a balance check that does not broadcast at zero QOR. The circuit list and the cross-VM `enabled` flag were read from Diana before any signing.

Rejected: inventing a transaction hash, guessing a faucet URL, and sending `MsgCrossVMCall` from an empty account. Also rejected treating the Canto `MsgConvertCoin` layout as QoreChain's. SDK 0.14.0 has no convert helper, and the fest tokens were not claimed.

Check: `npm run spike`. The signature checks still passed. The deposit line was `not run, maker has no QOR`, with `window found=false live=false`.

## 24 November 2026, deposit broadcast

Tool: Cursor agent, Grok 4.7.

Task: Use the faucet hash the user supplied, register the maker, and send the 1-base-unit hybrid deposit.

Files: `contracts/SpikeVault.sol`, `script/live/deposit.ts`, `docs/SPIKE.md`, `README.md`. `.env` stayed uncommitted.

Kept: `MsgRegisterPQCKeyV2` with a proof of possession, `MsgConvertCoin` of 1 fETH base unit, a short unscoped window only for the `SpikeVault` deploy, then `MsgCloseEVMWindow` before the deposit. The deposit, the approve, and the allowance clear are `crossvm.crossVmCall` with `sourceVm` `cosmwasm` and `targetVm` `evm`. The deposit hash is `53A558AF0FBBA66E66E8C0E7F2DF7131D1CC7D6EFFF7B565598F02B473553743`. `pqc_hybrid_verify` was `verified`. The window read after the close was `found: false`.

Rejected: broadcasting the first cross-VM shape. Simulation returned `source and target VM must differ` when both fields were `evm`, so that shape was not sent. Also rejected the three-transaction window fallback, because the hybrid call landed.

Check: the hashes in `docs/SPIKE.md` were read back from Diana, and the vault deploy receipt was `0x1`. `npm run spike` passed. The deposit line was hash `53A558AF0FBBA66E66E8C0E7F2DF7131D1CC7D6EFFF7B565598F02B473553743`, `pqc_hybrid_verify verified`, and `window found=false live=false`.

## 25 November 2026

Tool: Cursor agent, Grok 4.7.

Task: Deploy `OfferBook` on Diana from a fresh deployer, then close its window.

Files: `script/live/deploy.ts`, `.env.example`, `README.md`. The deployer phrase and `BOOK_ADDRESS` were written to `.env` and were not committed.

Kept: a separate deployer, funded with 15 QOR and no fest tokens. `MsgRegisterPQCKeyV2` with a proof of possession. An unscoped window of 120 blocks and one transaction, then `MsgCloseEVMWindow` even after that one transaction had already exhausted the window. Constructor arguments are fETH and fUSD. The book is `0x9faf23f3014c0922ca7d70da87b6783a3d2b5619`. A status read returned those tokens and `nextId` 1. The window read was `found: false`.

Rejected: deploying from the maker. The maker holds inventory. Also rejected leaving the exhausted window stored. `live: false` is not the same as closed.

Check: the five hashes were read back from Diana. The deploy receipt status was `0x1`. The deployer balance is only `uqor`. `possession_proven` is true and `algorithm_id` is 1.

## 25 November 2026, offer A

Tool: Cursor agent, Grok 4.7.

Task: Deposit 0.1 fETH, open offer A, broadcast the three attacker calls, and fill while the cancel delay was still running.

Files: `script/live/message.ts`, `script/live/book.ts`, `script/live/open.ts`, `script/live/attacker.ts`, `script/live/fill.ts`, `script/live/offer-a.ts`, `package.json`, `.env.example`, `README.md`, `docs/RUN.md`. The filler phrase was written to `.env` and was not committed.

Kept: 0.1 fETH, because the maker's faucet balance was 0.5 fETH. Prices stay `20 * 10^6` and `16 * 10^6`. Maker and filler actions are hybrid `MsgCrossVMCall` with `sourceVm` `cosmwasm`. The attacker script derives only the secp256k1 key. Cancel and withdraw send a 4,627-byte blob. The price call is `fill(uint256,uint256)`. The window's `maxValue` is one shared fee budget, so the withdraw used a second window after the first budget hit 0 uqor. `MsgSend` coins are sorted by denom. The fill landed in block 10698057. `cancelReadyAt` is 10698093. The curve price is `19918889` and the payment is `1991888`. The filler received `10^17` fETH. The maker received `1991888` fUSD.

Rejected: locking 10 fETH. Treating `maxValue` as a per-transaction cap. Sending `uqor` ahead of the `erc20:` denom. Leaving the maker window open after the attack.

Check: every hash in `docs/RUN.md` was read back from Diana. The three attacker receipts have status `0x0`. The maker window read was `found: false` and `live: false`. The filler key is algorithm 1 with `possession_proven` true.

## 26 November 2026, offer B

Tool: Cursor agent, Grok 4.7.

Task: Open the smaller offer, wait out the 40-block cancel delay, show the fill revert, and return the input to idle.

Files: `script/live/message.ts`, `script/live/book.ts`, `script/live/cancel.ts`, `package.json`, `IMPLEMENTATION.md`, `docs/RUN.md`, `README.md`.

Kept: 0.01 fETH, the same 10:1 ratio as the spec after the faucet scale. The same price line and a 40-block delay. The filler's matured `fill` is an EVM receipt with status `0x0`, because a simulated hybrid call would not be broadcast. The window was closed after that one transaction. `finalizeCancel` ran after the revert. Idle fETH is `10000000000000001` and reserved fETH is 0. Offer 2 status is cancelled. `cancelReadyAt` is block 10758165. The fill is in block 10758171.

Rejected: filling offer B during the delay. That would consume the inventory this step has to return. Offer A already showed that fill.

Check: every offer B hash in `docs/RUN.md` was read back from Diana. The fill receipt status was `0x0`. The filler window read was `found: false` and `live: false`.

## 26 November 2026, page

Tool: Cursor agent, Grok 4.7.

Task: Serve a read-only page that shows the filled offer without a wallet.

Files: `web/index.html`, `web/src/main.ts`, `web/src/runs.ts`, `web/src/style.css`, `web/vite.config.ts`, `web/tsconfig.json`, `package.json`, `package-lock.json`, `README.md`.

Kept: viem reads of offers 1 and 2 from `https://evm-testnet.qore.host`. The line runs from 20 fUSD to 16 fUSD. Offer 1 is Filled, `cancelReadyAt` 10698093, with the fill marked at 19.918889 fUSD. Offer 2 is Cancelled, `cancelReadyAt` 10758165. The hashes in `docs/RUN.md` link to `https://explore.qore.network/tx/`. No wallet and no key. Vite serves the page on port 5174 because 5173 was already in use.

Rejected: a wallet connection, and importing the live scripts, which read mnemonics. Also rejected inventing a query parameter to force the explorer onto testnet. Its network switch is the `qore-network` cookie, and the default is mainnet.

Check: a browser that was not logged in opened `http://localhost:5174/`. The page read next id 3 and showed offer 1 as Filled, matching `docs/RUN.md`. The fill link opened the explorer. On mainnet the hash was not found. After the header was set to Testnet, the same page showed that fill as success in block 10698057.

## 26 November 2026, book page

Tool: Cursor agent, Grok 4.7.

Task: Rebuild the read-only page as a book, a term sheet, and the run log.

Files: `.gitignore`, `web/index.html`, `web/tsconfig.json`, `web/src/tokens.css`, `web/src/style.css`, `web/src/main.ts`, `web/src/chain.ts`, `web/src/format.ts`, `web/src/curve.ts`, `web/src/copy.ts`, `web/src/book.ts`, `web/src/sheet.ts`, `web/src/record.ts`, `web/src/runs.ts`, `AI_USAGE.md`. The design notes were left untracked.

Kept: hash routes for the book, one offer, and the record. Live reads of `tokenA`, `tokenB`, `nextId`, and `offers`. fETH and fUSD labels only when the address matches the pinned tokens. The price line, with the offer A fill mark when the chain still matches the run log. The explorer warning. No wallet.

Rejected: a connect button, a fill button, and treating the run-log payment as a value stored on the offer.

Check: `npx tsc -p web/tsconfig.json --noEmit`. A browser that was not logged in opened `http://localhost:5174/#/book`. Offer 1 was Filled at `cancelReadyAt` 10698093. Offer 2 was Cancelled. `#/offer/1` showed the recorded fill. `#/offer/9` said that offer is not on the book. `#/record` listed the hashes. At 390px the page did not scroll sideways.

## 26 November 2026, black and bone

Tool: Cursor agent, Grok 4.7.

Task: Replace the beige page with one ground and one ink.

Files: `web/src/tokens.css`, `web/src/style.css`, `web/src/curve.ts`, `AI_USAGE.md`.

Kept: ground `#10100e` and ink `#f3f0e8`. The button is the same pair reversed. Status stays the word. The price line is ink. No hue and no motion.

Rejected: a gradient, a status palette, and a second layout.

Check: `npx tsc -p web/tsconfig.json --noEmit`. A browser opened `http://localhost:5174/#/book`, `#/offer/1`, and `#/record`. Offer 1 was Filled and offer 2 was Cancelled. The three price labels on the line did not overlap. At 390px the page width was 390.

## 26 November 2026, landing

Tool: Cursor agent, Grok 4.7.

Task: Add a landing page and motion with GSAP and Lenis.

Files: `package.json`, `package-lock.json`, `web/index.html`, `web/src/main.ts`, `web/src/landing.ts`, `web/src/motion.ts`, `web/src/tokens.css`, `web/src/style.css`, `AI_USAGE.md`.

Kept: [GSAP](https://github.com/greensock/GSAP) 3.15 for SplitText, DrawSVG, and ScrollTrigger. [Lenis](https://github.com/darkroomengineering/lenis) 1.3 for scroll. The home route reads offer 1 and draws its line. Brass `#e0a24a` on the black ground. `prefers-reduced-motion` skips the tweens.

Rejected: a React kit, a gradient, and a wallet control.

Check: `npx tsc -p web/tsconfig.json --noEmit`. A browser opened `http://localhost:5174/#/`. The headline, the brass line, and offer 1 were on the first screen. Open the book went to `#/book` and showed the same headline. At 390px the page width was 390.


