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

