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
