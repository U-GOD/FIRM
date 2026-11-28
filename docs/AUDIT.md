# QCAI

The setting for both stages is **Ethereum (EVM/Solidity)** on the Diana testnet dashboard. The CosmWasm setting is the wrong one for this book. Quantum readiness is **Not scored**. That is what the EVM setting returns. It is not a finding.

Stage 1 pasted `IQorePQC`, `Curve`, `OfferBytes`, and `OfferBook`. The auditor does not compile, so the OpenZeppelin imports were not inlined.

`_verify` in `OfferBook` is the only caller of the precompiles. It calls `pqcKeyStatus` at `0x…0a02` and `pqcVerify` at `0x…0a01`. A failed call or a short return reverts with `PrecompileInactive`. A registered key must be algorithm 1, ML-DSA-87, with `possessionProven` and a 2,592-byte key. A signature must be 4,627 bytes, and `pqcVerify` must return true. The tests are `test_empty_precompile_reverts`, `test_open_rejects_bad_signature`, `test_open_rejects_unproven_key`, and `test_open_rejects_wrong_algorithm`.

The PDF prints `OfferBook.sol:230`, `:168`, and `:210`. In this repo those lines are the `pqcVerify` call, `finalizeCancel`, and a fee-recipient check. The finding text names `withdraw`, the fee multiply in `fill`, and `_verify`. The rows below follow that text.

## Stage 1

27 November 2026, 00:32 UTC. Testnet. Contract name OfferBook. Cost 150 test QOR. Score 72/100. Risk medium. Five findings. PDF: [docs/audit/2026-11-27-stage-1.pdf](audit/2026-11-27-stage-1.pdf).

| Finding | Severity | Report location | What we did |
| --- | --- | --- | --- |
| Missing access control on critical functions | High | `OfferBook.sol:230` | False positive. `withdraw` ignores `msg.sender`. The signature names the maker, and the tokens are transferred to that address. A classical caller without that signature reverts. `test_classical_sender_cannot_withdraw` |
| Potential overflow in fee calculation | Medium | `OfferBook.sol:168` | False positive. The compiler is Solidity 0.8.28, so `gross * feeBps` reverts instead of wrapping. `feeBps` is capped at 100 before the offer is stored. `test_fee_paid_to_signed_recipient` |
| Unchecked precompile return values | Medium | `OfferBook.sol:210` | False positive. `_verify` checks the call success and the return length before `abi.decode`. Empty or short data reverts. `test_empty_precompile_reverts` |
| Unbounded loop risk in mapping operations | Low | `OfferBook.sol` | False positive. The report says the loop is not in the code. The mappings are not iterated. |
| Nonce management could be improved | Info | `OfferBook.sol` | False positive. `open` requires `terms.nonce == nonces[maker]` and then stores that nonce plus one. Cancel and withdraw sign `actionNonces[maker]` and then add one. `test_open_rejects_replay` |

No contract change. The five rows are the whole stage 1 list.

## Stage 2

28 November 2026, 00:45 UTC. Testnet. Same Ethereum setting and the same source. Contract name OfferBook. Cost 150 test QOR. Score 78/100. Risk medium. Quantum readiness not scored. Five findings. The contract was not changed between the two runs. PDF: [docs/audit/2026-11-28-stage-2.pdf](audit/2026-11-28-stage-2.pdf).

The 27 November retry had no wallet, then 100 faucet QOR against a 150 price. A second faucet claim on 28 November brought that wallet to 199.055 QOR, and this run went through.

| Finding | Severity | Report location | What we did |
| --- | --- | --- | --- |
| Missing access control on critical functions | High | `OfferBook.sol` | False positive. `deposit` pulls tokens from `msg.sender` and credits that same account. `open`, `startCancel`, and `withdraw` ignore `msg.sender` and require the maker's ML-DSA signature. `fill` and `finalizeCancel` are open to anyone on purpose. `test_deposit_credits_caller`, `test_classical_sender_cannot_cancel`, `test_classical_sender_cannot_withdraw` |
| Potential overflow in fee calculation | Medium | `OfferBook.sol:137` | False positive. Line 137 is the fee multiply. Solidity 0.8.28 checks it, which the report also says. `feeBps` is capped at 100, so an overflowing product reverts. `test_fee_paid_to_signed_recipient` |
| Unchecked precompile return values | Medium | `OfferBook.sol:173-179` | False positive. Those lines are `finalizeCancel`. `_verify` checks the call and the return length before `abi.decode`. `test_empty_precompile_reverts` |
| Unbounded loop potential in mapping access | Low | `OfferBook.sol` | False positive. `offers[id]` is one storage slot. The book does not loop over offers. |
| Nonce management vulnerability | Info | `OfferBook.sol:92` | False positive. Line 92 is the comment above `open`. `open` requires `terms.nonce == nonces[maker]` and then stores that nonce plus one. A captured signature cannot be replayed. `test_open_rejects_replay` |

No contract change. The five rows are the whole stage 2 list.
