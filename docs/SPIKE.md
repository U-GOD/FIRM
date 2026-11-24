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

The offer message is 512 bytes. That is `abi.encode` of the sixteen words in `OfferBytes.sol`. This run checked the TypeScript encoder. `test/OfferBytes.t.sol` later matched the same bytes.

## Deposit

Not run. There is no transaction hash and no chosen deposit path.

On 24 November 2026 the testnet still had `MsgCrossVMCall` enabled: `GET /cosmos/circuit/v1/disable_list` listed only `/cosmwasm.wasm.v1.MsgStoreCode`, and `GET /qorechain/crossvm/v1/params` returned `"enabled": true`. The call was not sent.

A fresh maker account was created for this spike. The phrase is in `.env`, which git ignores. It is not the public vector key.

| Form | Address |
| --- | --- |
| `qor1` | `qor1qxurkhjlhzr8lemm2z2pqqf4mr77gpgmrvxsyp` |
| `0x` | `0x01B83B5E5Fb8867fE77B5094100135D8Fde4051b` |

The account has no QOR. The faucet at https://dashboard.qorechain.io/faucet requires a sign-in, and no claim was made. The three-transaction window was not opened.

Step 1 in `IMPLEMENTATION.md` is done for the signature and not done for the deposit.
