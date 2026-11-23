# Precompile spike

Checked on 23 November 2026 against Diana, chain id 9800.

## What matched

`npm run spike` signs the offer, cancel, and withdraw bytes from `script/live/message.ts` with ML-DSA-87. `@noble/post-quantum` 0.5.4, empty context, `extraEntropy: false` (32 zero bytes of signing randomness, the deterministic mode). The same offer signature was then sent with `eth_call` to `pqcVerify` at `0x0000000000000000000000000000000000000a01`.

| Check | Result |
| --- | --- |
| Noble, offer, cancel, and withdraw | valid |
| Diana, offer signature | `true` |
| Diana, last bit of that signature flipped | `false` |
| Empty precompile data | not seen. The call returned a bool |
| `active_static_precompiles` | `0x…0901`, `0x…0a01`, `0x…0a02`, `0x…0c01` |
| fETH `symbol` / `decimals` | fETH / 18 |
| fUSD `symbol` / `decimals` | fUSD / 6 |

The vector is `test/vectors/offer.json`. The book address in it is the placeholder `0x…f19d`. The key comes from the public label `FIRM_VECTOR_SEED_V1`. It is not a maker key.

The offer message is 512 bytes. That is `abi.encode` of the sixteen words in `OfferBytes.sol`. This run checked the TypeScript encoder. Forge is not installed in WSL, so the Solidity function has not been executed yet.

## Deposit

Not run. No maker mnemonic was in the environment, and none was created for this spike. There is no transaction hash and no chosen deposit path. `MsgCrossVMCall` was not sent. The three-transaction window was not opened.

Step 1 in `IMPLEMENTATION.md` is done for the signature and not done for the deposit. The deposit waits on a key that stays out of git.
