// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {OfferBytes} from "../contracts/libraries/OfferBytes.sol";

contract OfferBytesTest is Test {
    using stdJson for string;

    function test_vector_offer_matches_encoder() public view {
        string memory json = vm.readFile("test/vectors/offer.json");
        bytes memory expected = json.readBytes(".offer.message");

        address maker = address(uint160(0xf19e));
        address book = address(uint160(0xf19d));
        OfferBytes.Offer memory offer = OfferBytes.Offer({
            maker: maker,
            tokenIn: 0x02292293c13880a26242690eb70a0e42B8E91c28,
            tokenOut: 0x97143B771D34ddb9130b807b135Ae675A5a963CA,
            amountIn: 10 ether,
            startPrice: 20_000_000,
            endPrice: 16_000_000,
            startTime: 1_767_225_600,
            endTime: 1_767_232_800,
            recipient: maker,
            cancelDelay: 40,
            nonce: 0,
            feeBps: 0,
            feeRecipient: address(0)
        });

        bytes memory encoded = OfferBytes.encodeOffer(offer, book, 9800);
        assertEq(encoded, expected);
    }

    function test_vector_cancel_and_withdraw_match() public view {
        string memory json = vm.readFile("test/vectors/offer.json");
        address maker = address(uint160(0xf19e));
        address book = address(uint160(0xf19d));

        bytes memory cancelEncoded = OfferBytes.encodeCancel(
            OfferBytes.Cancel({offerId: 1, maker: maker, actionNonce: 0}), book, 9800
        );
        assertEq(cancelEncoded, json.readBytes(".cancel.message"));

        bytes memory withdrawEncoded = OfferBytes.encodeWithdraw(
            OfferBytes.Withdraw({
                maker: maker,
                token: 0x02292293c13880a26242690eb70a0e42B8E91c28,
                amount: 1,
                actionNonce: 0
            }),
            book,
            9800
        );
        assertEq(withdrawEncoded, json.readBytes(".withdraw.message"));
    }
}
