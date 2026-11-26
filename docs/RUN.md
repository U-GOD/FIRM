# Offer A

Recorded on 25 November 2026 on Diana. Offer 1 on `0x9faf23f3014c0922ca7d70da87b6783a3d2b5619`.

The faucet balance was 0.5 fETH, so this offer locks 0.1 fETH (`10^17` base units). The line runs for two hours from 20 fUSD to 16 fUSD per fETH. Those prices are `20000000` and `16000000`. The cancel delay is 40 blocks. The fee is 0. The recipient is the maker.

| Role | Account |
| --- | --- |
| Maker | `qor1qxurkhjlhzr8lemm2z2pqqf4mr77gpgmrvxsyp` / `0x01B83B5E5Fb8867fE77B5094100135D8Fde4051b` |
| Filler | `qor1ejl6spd6swshh0hynuvdq0g4vy78enwsfj6quz` / `0xCcbfA805ba83a17bbeE49f18D03d15613c7ccDD0` |

The filler is our second key. Nobody outside the team filled this offer.

Deposit, open, cancel, and fill are hybrid `MsgCrossVMCall` transactions. `pqc_hybrid_verify` on each of those is `verified`. The filler registration is the account's first transaction, signed classically, so it has no hybrid event. Its code is 0. The key read after that registration is algorithm 1 with `possession_proven` true.

| Step | Hash |
| --- | --- |
| Convert 0.1 fETH plus 1 base unit | `95B38D4EF2266EDA3A3906A2B33C6CCA1F4F1A605B6BD2CFBED33A60BE812E23` |
| Approve the book | `4AA7E73F4C2F795B878CDD1227750EC2713C28819673F7C5BAD8183E01DB7046` |
| Deposit | `46C52ED9CD5BBF253974995060090E4B2F80D9D8963C474FDA4698C1735197CC` |
| Open offer 1 | `1FF2E1259F9CEA876BD12FCC01C770EFBA922BA170511DEB125D9267E6414B31` |
| First attack window | `E385DECE3C1CE58FBFD4CA34C73F7FB8FAE13E96DC0223A0CDB17E93EC2DCF72` |
| Attacker `startCancel` | `0x72a6dcb45e6340a99f1f6a4682f03ae829acd68a37b8097174db022b1e57eb3c` |
| Attacker `fill(id, 1)` | `0x6ae3e1542b7cd6d0a5f68c248f2ace56b84e75c915faac57dc1babd1041b2b5f` |
| Close the first window | `5298C13D80CEA9010E6138948BD9BB812F82AED611F06B90BCD28951A5EBCCB1` |
| Approve the book for zero | `CB0A3EE3D05FD9ED98BCB892E29FD9D4A3E77C503C7169A2FD46984D494D573D` |
| Second attack window | `D203B084351DD3F2547DD4E5CCC6888E80DAC9F91AB7AF278A6AB5932D7FC642` |
| Attacker `withdraw` | `0x92c7216bc5959e440ceec557452fb6f5f84c0c917774798b398b2ff1e056de2e` |
| Close the second window | `B24DC8FB94B0652E6EC669A45EB6E46EF5EBD9B99B5F5FA01704030E95AFD8D2` |
| Fund the filler | `246B3449FC8587445C2086B88C51B89C7664589F9A0809EF60B2F286240D1DBF` |
| Register the filler | `80B7CCB6633F16264FD7F596CB8A124ED2242DA7C7BAA7CB6BDF8EA67ACBBEBE` |
| Convert 5 fUSD | `1308D8C0C5D98DD6DA2732C1F0776B7E556CB9A6D9DD563640457145D95E40D2` |
| Filler approves the book | `7657753DC76CD8ACF9BCD8BD8080C27542E9880037A3FBEC219B1F0AF8EF5C0E` |
| ML-DSA `startCancel` | `00D6D5B16A81A0E4B392A43D12AA9169F4ED3B1430BDD2437216D6EBED2C5133` |
| Fill | `728AF94ED8A562194B1B9BC013059E5D890317458D35E582AA981F21DBD7E3A1` |

The attacker's three receipts have status `0x0`. They were sent with the maker's secp256k1 key and no ML-DSA signature. `startCancel` and `withdraw` carried a 4,627-byte blob that is not an ML-DSA signature. `eth_call` of the same two functions with an empty signature returned `BadSignature` and was not broadcast. `fill(uint256,uint256)` is not a function on the book, so the price of 1 has nowhere to go.

The first window's shared fee budget covered two of those calls and then had 0 uqor left. The withdraw went out in a second window. After the second close, the maker window read was `found: false` and `live: false`. Idle was still 1 base unit and reserved was still the 0.1 fETH.

Cancel started at height 10698053. The offer's `cancelReadyAt` is block 10698093. The fill is in block 10698057, which is before that.

At that block the curve price is `19918889` fUSD base units per `10^18` fETH base units. Payment is `10^17 * 19918889 / 10^18 = 1991888`. The filler's fETH balance rose from 0 to `100000000000000000`. The maker's fUSD balance rose from 0 to `1991888`.

## Offer B

Recorded on 26 November 2026. Offer 2 on the same book. It locks 0.01 fETH (`10^16` base units), one tenth of offer A. The line, the delay, and the fee are the same. This offer is not filled. The cancel is allowed to mature, a fill reverts, and `finalizeCancel` returns the input to idle.

| Step | Hash |
| --- | --- |
| Convert 0.01 fETH | `46A2328D8D0B1219FAA65FF1D43F8FF75B319E1254A8CF281E737BEA18EC74AF` |
| Approve the book | `762A453EEAAE90360B5045B0B3C1E7A8823A62FC4BCAE24A5BCFC5B00FC7A3B9` |
| Deposit | `AD0C45231B95F092F53410EA80A079C115CE730768E7892BC816468DCB8DD767` |
| Approve the book for zero | `2A96AF57E0CA58B59D779646BA8CA22075924FF53DBA9BD469D9712216086068` |
| Open offer 2 | `DBCF1AF6213DBD36A945016A650BA06593C8C7FCD4CD8E0699964757D649C4EA` |
| ML-DSA `startCancel` | `D44FB612073ADC3626549BADF08BC884A8FFD6657E1F70065E8CC95DB613F523` |
| Filler window | `64C344A9127777CFA052A693FDB742A5121DC1DBB05C32B599273A36F2BFD200` |
| Matured `fill` | `0xa60a941f9991e91f5bae66dcdfaa1bb136bd97db0e188329933637a8e34324fb` |
| Close the filler window | `FBAC2694156A18427748A035D152D9F464179925351E8F2CB1337B35A614B045` |
| `finalizeCancel` | `B935C304B232A2A7D8C0BDC069A8E9FCDD294E9C11473C5BEB55F86B8D7DD5C2` |

Cancel started at height 10758125. `cancelReadyAt` is block 10758165. The fill receipt is status `0x0` in block 10758171. After finalize, offer 2 is cancelled, fETH reserved is 0, and the maker's idle fETH is `10000000000000001` (the 0.01 fETH plus the 1 base unit left from offer A). The filler window read was `found: false` and `live: false`.

