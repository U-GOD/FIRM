---
name: firm-build
description: >-
  Builds the FIRM Dutch offer book on QoreChain Diana from IMPLEMENTATION.md.
  Use when writing or changing contracts, Foundry tests, live scripts, the
  spectator page, audit notes, or commits in this repository.
---

# FIRM build

Read `IMPLEMENTATION.md` before writing code. The README is the short version. If a code change disagrees with a test named in the spec, update the spec in that same commit.

## Order

Work the numbered steps in "Order of work" one at a time. Do not start a step until the previous done condition is met. Do not add partial fills, bonds, ML-KEM, a third token, account abstraction, the AI precompiles, or a mainnet deployment.

## Signatures

Sign the `abi.encode` payload from "The signed bytes". The precompile sees those raw bytes. Empty ML-DSA context. Do not sign a hash in one client and the raw fields in another. Chain id, book address, and nonce stay inside the signed bytes.

`pqcVerify` and `pqcKeyStatus` must fail closed on empty or short return data. Algorithm id is 1. `possessionProven` must be true. `registered` alone is not enough. No `ecrecover`. No `msg.sender` check that treats the classical key as the maker.

## Evidence

Do not invent transaction hashes, token addresses, audit findings, or an outside filler. Diana RPC is `https://evm-testnet.qore.host`, chain id 9800. A signature counts only after `@noble/post-quantum` and an `eth_call` to `0x…0a01` agree, including one flipped bit. Forge tests use the mock. They do not prove FIPS 204.

Never commit a mnemonic, a seed, or an ML-DSA secret key. The public test vector key is not a maker key.

## Commits and the usage log

Commit each file by itself. The message is one short sentence. Do not add a `Co-authored-by` trailer.

Append `AI_USAGE.md` for the session that just happened: tool, date, task, files, what was kept, what was rejected, and the command that checked the result. Do not invent agents, prompts, or review passes.

## Deposit

Prefer hybrid `MsgCrossVMCall`. If the node rejects it, write the error in `docs/SPIKE.md` and use the three-transaction scoped window. Say that the fallback has a race.
