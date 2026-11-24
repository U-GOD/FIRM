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

The path that landed is hybrid `MsgCrossVMCall`. The script calls `crossvm.crossVmCall` from `@qorechain/sdk` 0.14.0. A simulation with `sourceVm` and `targetVm` both set to `evm` was rejected with `source and target VM must differ` and was not broadcast. The call that landed sets `sourceVm` to `cosmwasm` and `targetVm` to `evm`.

The maker phrase is in `.env`, which git ignores. It is not the public vector key.

| Form | Address |
| --- | --- |
| `qor1` | `qor1qxurkhjlhzr8lemm2z2pqqf4mr77gpgmrvxsyp` |
| `0x` | `0x01B83B5E5Fb8867fE77B5094100135D8Fde4051b` |

Checked on 24 November 2026. Every hash below has code 0 on `https://api-testnet.qore.host`.

| Step | Hash | What it is |
| --- | --- | --- |
| Faucet, 100 QOR | `FDCF0340713ACFFAC756298162B7A90B7162869C72F8354896C5C9078E3E711B` | `MsgSend` of `100000000` uqor, height 10637512 |
| Faucet, fest tokens | `D68789C907D1890AD208B33EC15A2AAEF73778D8602D107F05E2870F55ADE587` | `MsgSend` of 0.5 fETH, 1000 fUSD, and 0.02 fBTC as bank denoms, height 10637515 |
| Register | `1AD54AD089142316672D4167C251BD686464BE8604DD3ABC6CDF78FF72592A81` | `MsgRegisterPQCKeyV2`, classical only, height 10637759. `possession_proven` is true and `algorithm_id` is 1 |
| Convert | `02FE84BAEB8EA8A46C7C4EF7783FD8EC3EA70367849946EAE6DD69662C995E16` | `MsgConvertCoin` of 1 base unit of fETH. `pqc_hybrid_verify` status `verified` |
| Open window | `5D540315E755D9C38DEF2902BDED9ED024EA8E35DC398F67010CEBFEC114BBDB` | Short unscoped window, only to deploy the throwaway. `verified` |
| Deploy vault | `0x94a3730297136fe0fa8fd5c3b9b33a3d83c184471eca6bd5b36bc806390f7ebc` | EVM deploy of `SpikeVault` at `0x61d270ff4c39b9fb31de9337ed793fd716e031bc`. Receipt status `0x1` |
| Close window | `A46368DE1A10FDE17E2CE7D998BAA8B900238E1B0FEBB29F5679FB076B114EAA` | `MsgCloseEVMWindow`. `verified` |
| Approve | `DF8655DD59D963F941B92079BE4262115C2ED870A583C79DC0A426732B51525F` | `MsgCrossVMCall` `approve` of 1 base unit. `verified` |
| Deposit | `53A558AF0FBBA66E66E8C0E7F2DF7131D1CC7D6EFFF7B565598F02B473553743` | `MsgCrossVMCall` `deposit` of 1 base unit of fETH. `verified` |
| Clear allowance | `CC267E74266F43A090428CF101DED2514D9383F6C284A637A3A1869D3BC7C787` | `MsgCrossVMCall` `approve` of 0. `verified` |

After the close, `GET /qorechain/pqc/v1/evm_window/qor1qxurkhjlhzr8lemm2z2pqqf4mr77gpgmrvxsyp` returned `found: false` and `live: false`. The deposit did not use an open window. The three-transaction fallback was not used.

The book is not deployed. `SpikeVault` is the throwaway the spec allows for this spike.

Step 1 in `IMPLEMENTATION.md` is done.
