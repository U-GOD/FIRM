/** Hashes copied from docs/RUN.md. The page does not invent any. */
export const BOOK = "0x9faf23f3014c0922ca7d70da87b6783a3d2b5619" as const;
export const EXPLORER = "https://explore.qore.network/tx/";

export const RECORDED = {
  offerA: {
    id: 1n,
    amount: 10n ** 17n,
    status: 2,
    cancelReadyAt: 10698093n,
    fillBlock: 10698057n,
    unitPrice: 19918889n,
    gross: 1991888n,
  },
  offerB: {
    id: 2n,
    amount: 10n ** 16n,
    status: 4,
    cancelReadyAt: 10758165n,
    fillBlock: 10758171n,
  },
} as const;

export const RUNS: { title: string; rows: { step: string; hash: string }[] }[] = [
  {
    title: "Offer A",
    rows: [
      { step: "Convert 0.1 fETH plus 1 base unit", hash: "95B38D4EF2266EDA3A3906A2B33C6CCA1F4F1A605B6BD2CFBED33A60BE812E23" },
      { step: "Approve the book", hash: "4AA7E73F4C2F795B878CDD1227750EC2713C28819673F7C5BAD8183E01DB7046" },
      { step: "Deposit", hash: "46C52ED9CD5BBF253974995060090E4B2F80D9D8963C474FDA4698C1735197CC" },
      { step: "Open offer 1", hash: "1FF2E1259F9CEA876BD12FCC01C770EFBA922BA170511DEB125D9267E6414B31" },
      { step: "First attack window", hash: "E385DECE3C1CE58FBFD4CA34C73F7FB8FAE13E96DC0223A0CDB17E93EC2DCF72" },
      { step: "Attacker startCancel", hash: "0x72a6dcb45e6340a99f1f6a4682f03ae829acd68a37b8097174db022b1e57eb3c" },
      { step: "Attacker fill(id, 1)", hash: "0x6ae3e1542b7cd6d0a5f68c248f2ace56b84e75c915faac57dc1babd1041b2b5f" },
      { step: "Close the first window", hash: "5298C13D80CEA9010E6138948BD9BB812F82AED611F06B90BCD28951A5EBCCB1" },
      { step: "Approve the book for zero", hash: "CB0A3EE3D05FD9ED98BCB892E29FD9D4A3E77C503C7169A2FD46984D494D573D" },
      { step: "Second attack window", hash: "D203B084351DD3F2547DD4E5CCC6888E80DAC9F91AB7AF278A6AB5932D7FC642" },
      { step: "Attacker withdraw", hash: "0x92c7216bc5959e440ceec557452fb6f5f84c0c917774798b398b2ff1e056de2e" },
      { step: "Close the second window", hash: "B24DC8FB94B0652E6EC669A45EB6E46EF5EBD9B99B5F5FA01704030E95AFD8D2" },
      { step: "Fund the filler", hash: "246B3449FC8587445C2086B88C51B89C7664589F9A0809EF60B2F286240D1DBF" },
      { step: "Register the filler", hash: "80B7CCB6633F16264FD7F596CB8A124ED2242DA7C7BAA7CB6BDF8EA67ACBBEBE" },
      { step: "Convert 5 fUSD", hash: "1308D8C0C5D98DD6DA2732C1F0776B7E556CB9A6D9DD563640457145D95E40D2" },
      { step: "Filler approves the book", hash: "7657753DC76CD8ACF9BCD8BD8080C27542E9880037A3FBEC219B1F0AF8EF5C0E" },
      { step: "ML-DSA startCancel", hash: "00D6D5B16A81A0E4B392A43D12AA9169F4ED3B1430BDD2437216D6EBED2C5133" },
      { step: "Fill", hash: "728AF94ED8A562194B1B9BC013059E5D890317458D35E582AA981F21DBD7E3A1" },
    ],
  },
  {
    title: "Offer B",
    rows: [
      { step: "Convert 0.01 fETH", hash: "46A2328D8D0B1219FAA65FF1D43F8FF75B319E1254A8CF281E737BEA18EC74AF" },
      { step: "Approve the book", hash: "762A453EEAAE90360B5045B0B3C1E7A8823A62FC4BCAE24A5BCFC5B00FC7A3B9" },
      { step: "Deposit", hash: "AD0C45231B95F092F53410EA80A079C115CE730768E7892BC816468DCB8DD767" },
      { step: "Approve the book for zero", hash: "2A96AF57E0CA58B59D779646BA8CA22075924FF53DBA9BD469D9712216086068" },
      { step: "Open offer 2", hash: "DBCF1AF6213DBD36A945016A650BA06593C8C7FCD4CD8E0699964757D649C4EA" },
      { step: "ML-DSA startCancel", hash: "D44FB612073ADC3626549BADF08BC884A8FFD6657E1F70065E8CC95DB613F523" },
      { step: "Filler window", hash: "64C344A9127777CFA052A693FDB742A5121DC1DBB05C32B599273A36F2BFD200" },
      { step: "Matured fill", hash: "0xa60a941f9991e91f5bae66dcdfaa1bb136bd97db0e188329933637a8e34324fb" },
      { step: "Close the filler window", hash: "FBAC2694156A18427748A035D152D9F464179925351E8F2CB1337B35A614B045" },
      { step: "finalizeCancel", hash: "B935C304B232A2A7D8C0BDC069A8E9FCDD294E9C11473C5BEB55F86B8D7DD5C2" },
    ],
  },
];
