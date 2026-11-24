// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {OfferBook} from "../contracts/OfferBook.sol";
import {OfferBytes} from "../contracts/libraries/OfferBytes.sol";
import {PqcMock} from "./mocks/PqcMock.sol";
import {FeeOnTransferToken, MockERC20, ReenterToken} from "./mocks/TestTokens.sol";

contract BookFixture is Test {
    address internal constant STATUS = 0x0000000000000000000000000000000000000a02;
    address internal constant VERIFY = 0x0000000000000000000000000000000000000a01;

    PqcMock internal status;
    PqcMock internal verify;

    function etchPrecompiles() internal {
        PqcMock impl = new PqcMock();
        vm.etch(STATUS, address(impl).code);
        vm.etch(VERIFY, address(impl).code);
        status = PqcMock(STATUS);
        verify = PqcMock(VERIFY);
        status.setActive(true);
        verify.setActive(true);
    }

    function keyFor(uint256 salt) internal pure returns (bytes memory pubkey) {
        pubkey = new bytes(2592);
        for (uint256 i; i < 2592; i += 32) {
            bytes32 word = keccak256(abi.encode(salt, i));
            assembly {
                mstore(add(add(pubkey, 32), i), word)
            }
        }
    }

    function signWith(bytes memory pubkey, bytes memory message) internal pure returns (bytes memory sig) {
        bytes32 digest = keccak256(abi.encode(pubkey, keccak256(message)));
        sig = new bytes(4627);
        assembly {
            mstore(add(sig, 32), digest)
        }
    }

    function junkSignature() internal pure returns (bytes memory sig) {
        sig = new bytes(4627);
        sig[0] = 0x11;
    }
}

contract OfferBookTest is BookFixture {
    MockERC20 internal tokenIn;
    MockERC20 internal tokenOut;
    OfferBook internal book;

    address internal maker = makeAddr("maker");
    address internal filler = makeAddr("filler");
    address internal recipient = makeAddr("recipient");
    address internal feeTo = makeAddr("fee");
    address internal other = makeAddr("other");
    bytes internal makerKey;

    uint256 internal startTime = 1_000_000;
    uint256 internal endTime = 1_000_000 + 2 hours;

    function setUp() public {
        etchPrecompiles();
        tokenIn = new MockERC20("TIN", 18);
        tokenOut = new MockERC20("TOUT", 18);
        book = new OfferBook(address(tokenIn), address(tokenOut));
        makerKey = keyFor(1);
        status.setKey(maker, makerKey, 1, true);

        tokenIn.mint(maker, 100 ether);
        vm.startPrank(maker);
        tokenIn.approve(address(book), type(uint256).max);
        book.deposit(address(tokenIn), 100 ether);
        vm.stopPrank();

        tokenOut.mint(filler, 1_000_000 ether);
        vm.prank(filler);
        tokenOut.approve(address(book), type(uint256).max);
    }

    function test_deposit_credits_caller() public {
        MockERC20 token = new MockERC20("TIN", 18);
        OfferBook fresh = new OfferBook(address(token), address(tokenOut));
        token.mint(maker, 10 ether);
        vm.prank(maker);
        token.approve(address(fresh), 10 ether);

        vm.prank(other);
        vm.expectRevert();
        fresh.deposit(address(token), 10 ether);

        assertEq(token.balanceOf(maker), 10 ether);
        assertEq(fresh.idle(maker, address(token)), 0);

        vm.prank(maker);
        fresh.deposit(address(token), 10 ether);
        assertEq(fresh.idle(maker, address(token)), 10 ether);
        assertEq(token.balanceOf(address(fresh)), 10 ether);
        assertEq(fresh.idle(other, address(token)), 0);
    }

    function test_open_moves_idle_to_reserved() public {
        uint256 id = _open(4 ether, 20 ether, 16 ether, startTime, endTime, 40, 0, address(0));
        assertEq(book.idle(maker, address(tokenIn)), 96 ether);
        assertEq(book.reserved(address(tokenIn)), 4 ether);
        assertEq(tokenIn.balanceOf(address(book)), 100 ether);
        (,,, uint256 amount,,,,,,,,,, OfferBook.Status status_) = book.offers(id);
        assertEq(amount, 4 ether);
        assertEq(uint256(status_), uint256(OfferBook.Status.Open));
    }

    function test_open_rejects_bad_signature() public {
        OfferBytes.Offer memory terms = _terms(1 ether, 20 ether, 16 ether, startTime, endTime, 40, 0, address(0));
        bytes memory message = OfferBytes.encodeOffer(terms, address(book));
        bytes memory sig = signWith(makerKey, message);
        sig[sig.length - 1] ^= 0x01;
        vm.expectRevert(OfferBook.BadSignature.selector);
        book.open(terms, sig);
        assertEq(book.idle(maker, address(tokenIn)), 100 ether);
    }

    function test_open_rejects_unproven_key() public {
        status.setKey(maker, makerKey, 1, false);
        OfferBytes.Offer memory terms = _terms(1 ether, 20 ether, 16 ether, startTime, endTime, 40, 0, address(0));
        vm.expectRevert(OfferBook.BadKey.selector);
        book.open(terms, signWith(makerKey, OfferBytes.encodeOffer(terms, address(book))));
    }

    function test_open_rejects_wrong_algorithm() public {
        status.setKey(maker, makerKey, 2, true);
        OfferBytes.Offer memory terms = _terms(1 ether, 20 ether, 16 ether, startTime, endTime, 40, 0, address(0));
        vm.expectRevert(OfferBook.BadKey.selector);
        book.open(terms, signWith(makerKey, OfferBytes.encodeOffer(terms, address(book))));
    }

    function test_open_rejects_replay() public {
        OfferBytes.Offer memory terms = _terms(1 ether, 20 ether, 16 ether, startTime, endTime, 40, 0, address(0));
        bytes memory sig = signWith(makerKey, OfferBytes.encodeOffer(terms, address(book)));
        book.open(terms, sig);
        vm.expectRevert(OfferBook.StaleNonce.selector);
        book.open(terms, sig);
    }

    function test_open_rejects_cross_contract_replay() public {
        OfferBytes.Offer memory terms = _terms(1 ether, 20 ether, 16 ether, startTime, endTime, 40, 0, address(0));
        bytes memory sig = signWith(makerKey, OfferBytes.encodeOffer(terms, address(book)));
        OfferBook otherBook = new OfferBook(address(tokenIn), address(tokenOut));
        tokenIn.mint(maker, 1 ether);
        vm.startPrank(maker);
        tokenIn.approve(address(otherBook), 1 ether);
        otherBook.deposit(address(tokenIn), 1 ether);
        vm.stopPrank();
        vm.expectRevert(OfferBook.BadSignature.selector);
        otherBook.open(terms, sig);
        assertEq(otherBook.nonces(maker), 0);
    }

    function test_open_rejects_zero_duration() public {
        OfferBytes.Offer memory terms = _terms(1 ether, 20 ether, 16 ether, startTime, startTime, 40, 0, address(0));
        vm.expectRevert(OfferBook.BadTerms.selector);
        book.open(terms, junkSignature());
    }

    function test_open_rejects_delay_out_of_range() public {
        OfferBytes.Offer memory zero = _terms(1 ether, 20 ether, 16 ether, startTime, endTime, 0, 0, address(0));
        vm.expectRevert(OfferBook.BadTerms.selector);
        book.open(zero, junkSignature());

        OfferBytes.Offer memory high = _terms(1 ether, 20 ether, 16 ether, startTime, endTime, 7_201, 0, address(0));
        vm.expectRevert(OfferBook.BadTerms.selector);
        book.open(high, junkSignature());
    }

    function test_fill_charges_midpoint() public {
        uint256 id = _open(1 ether, 20 ether, 16 ether, startTime, endTime, 40, 0, address(0));
        vm.warp(startTime + 1 hours);
        uint256 before = tokenOut.balanceOf(recipient);
        vm.prank(filler);
        book.fill(id);
        assertEq(tokenOut.balanceOf(recipient) - before, 18 ether);
        assertEq(tokenIn.balanceOf(filler), 1 ether);
        assertEq(book.reserved(address(tokenIn)), 0);
    }

    function test_fill_charges_endpoints() public {
        uint256 atStart = _open(1 ether, 20 ether, 16 ether, startTime, endTime, 40, 0, address(0));
        vm.warp(startTime);
        vm.prank(filler);
        book.fill(atStart);
        assertEq(tokenOut.balanceOf(recipient), 20 ether);

        uint256 atEnd = _open(1 ether, 20 ether, 16 ether, startTime, endTime, 40, 0, address(0));
        vm.warp(endTime);
        uint256 before = tokenOut.balanceOf(recipient);
        vm.prank(filler);
        book.fill(atEnd);
        assertEq(tokenOut.balanceOf(recipient) - before, 16 ether);
    }

    function test_fill_rejects_before_start_and_after_end() public {
        uint256 id = _open(1 ether, 20 ether, 16 ether, startTime, endTime, 40, 0, address(0));
        vm.warp(startTime - 1);
        vm.prank(filler);
        vm.expectRevert(OfferBook.TooEarly.selector);
        book.fill(id);

        vm.warp(endTime + 1);
        vm.prank(filler);
        vm.expectRevert(OfferBook.TooLate.selector);
        book.fill(id);
    }

    function test_fill_ignores_msg_sender_as_maker() public {
        uint256 id = _open(1 ether, 20 ether, 16 ether, startTime, endTime, 40, 0, address(0));
        tokenOut.mint(maker, 100 ether);
        vm.prank(maker);
        tokenOut.approve(address(book), type(uint256).max);
        vm.warp(startTime + 1 hours);
        vm.prank(maker);
        book.fill(id);
        assertEq(tokenOut.balanceOf(recipient), 18 ether);
        assertEq(tokenIn.balanceOf(maker), 1 ether);
    }

    function test_classical_sender_cannot_cancel() public {
        uint256 id = _open(1 ether, 20 ether, 16 ether, startTime, endTime, 40, 0, address(0));
        uint256 reservedBefore = book.reserved(address(tokenIn));
        vm.prank(maker);
        vm.expectRevert(OfferBook.BadSignature.selector);
        book.startCancel(id, junkSignature());
        assertEq(book.reserved(address(tokenIn)), reservedBefore);
        assertEq(book.actionNonces(maker), 0);
    }

    function test_classical_sender_cannot_withdraw() public {
        uint256 idleBefore = book.idle(maker, address(tokenIn));
        vm.prank(maker);
        vm.expectRevert(OfferBook.BadSignature.selector);
        book.withdraw(maker, address(tokenIn), 1 ether, junkSignature());
        assertEq(book.idle(maker, address(tokenIn)), idleBefore);
        assertEq(tokenIn.balanceOf(maker), 0);
    }

    function test_cancel_does_not_block_fill_before_maturity() public {
        uint256 id = _open(1 ether, 20 ether, 16 ether, startTime, endTime, 1, 0, address(0));
        vm.roll(50);
        vm.warp(startTime);
        _cancel(id);
        (,,,,,,,,,,,, uint64 ready,) = book.offers(id);
        assertEq(ready, 51);
        vm.prank(filler);
        book.fill(id);
        assertEq(tokenIn.balanceOf(filler), 1 ether);
    }

    function test_fill_reverts_after_cancel_matures() public {
        uint256 id = _open(1 ether, 20 ether, 16 ether, startTime, endTime, 1, 0, address(0));
        vm.roll(50);
        vm.warp(startTime);
        _cancel(id);
        vm.roll(51);
        vm.prank(filler);
        vm.expectRevert(OfferBook.NotOpen.selector);
        book.fill(id);
        assertEq(book.reserved(address(tokenIn)), 1 ether);
    }

    function test_finalize_too_early() public {
        uint256 id = _open(1 ether, 20 ether, 16 ether, startTime, endTime, 40, 0, address(0));
        vm.roll(10);
        _cancel(id);
        vm.expectRevert(OfferBook.CancelWaiting.selector);
        book.finalizeCancel(id);
        vm.roll(50);
        book.finalizeCancel(id);
        assertEq(book.idle(maker, address(tokenIn)), 100 ether);
        assertEq(book.reserved(address(tokenIn)), 0);
    }

    function test_fee_paid_to_signed_recipient() public {
        uint256 id = _open(1 ether, 20 ether, 16 ether, startTime, endTime, 40, 100, feeTo);
        vm.warp(startTime);
        vm.prank(filler);
        book.fill(id);
        assertEq(tokenOut.balanceOf(recipient), 19.8 ether);
        assertEq(tokenOut.balanceOf(feeTo), 0.2 ether);
    }

    function test_rotated_key_cancels_old_signature_fails() public {
        uint256 id = _open(1 ether, 20 ether, 16 ether, startTime, endTime, 40, 0, address(0));
        bytes memory oldMessage = OfferBytes.encodeCancel(
            OfferBytes.Cancel({offerId: id, maker: maker, actionNonce: 0}), address(book)
        );
        bytes memory oldSig = signWith(makerKey, oldMessage);

        bytes memory nextKey = keyFor(2);
        status.setKey(maker, nextKey, 1, true);

        vm.expectRevert(OfferBook.BadSignature.selector);
        book.startCancel(id, oldSig);

        bytes memory newSig = signWith(nextKey, oldMessage);
        book.startCancel(id, newSig);
        (,,,,,,,,,,,,, OfferBook.Status status_) = book.offers(id);
        assertEq(uint256(status_), uint256(OfferBook.Status.CancelPending));
    }

    function test_empty_precompile_reverts() public {
        status.setActive(false);
        OfferBytes.Offer memory terms = _terms(1 ether, 20 ether, 16 ether, startTime, endTime, 40, 0, address(0));
        vm.expectRevert(OfferBook.PrecompileInactive.selector);
        book.open(terms, signWith(makerKey, OfferBytes.encodeOffer(terms, address(book))));
        assertEq(book.nonces(maker), 0);
    }

    function _open(
        uint256 amount,
        uint256 startPrice,
        uint256 endPrice,
        uint256 start_,
        uint256 end_,
        uint256 delay,
        uint256 feeBps,
        address feeRecipient
    ) internal returns (uint256 id) {
        OfferBytes.Offer memory terms = _terms(amount, startPrice, endPrice, start_, end_, delay, feeBps, feeRecipient);
        bytes memory sig = signWith(makerKey, OfferBytes.encodeOffer(terms, address(book)));
        id = book.open(terms, sig);
    }

    function _cancel(uint256 id) internal {
        bytes memory message = OfferBytes.encodeCancel(
            OfferBytes.Cancel({offerId: id, maker: maker, actionNonce: book.actionNonces(maker)}), address(book)
        );
        book.startCancel(id, signWith(makerKey, message));
    }

    function _terms(
        uint256 amount,
        uint256 startPrice,
        uint256 endPrice,
        uint256 start_,
        uint256 end_,
        uint256 delay,
        uint256 feeBps,
        address feeRecipient
    ) internal view returns (OfferBytes.Offer memory) {
        return OfferBytes.Offer({
            maker: maker,
            tokenIn: address(tokenIn),
            tokenOut: address(tokenOut),
            amountIn: amount,
            startPrice: startPrice,
            endPrice: endPrice,
            startTime: start_,
            endTime: end_,
            recipient: recipient,
            cancelDelay: delay,
            nonce: book.nonces(maker),
            feeBps: feeBps,
            feeRecipient: feeRecipient
        });
    }
}

contract OfferBookHostileTokenTest is BookFixture {
    address internal maker = makeAddr("maker");
    address internal filler = makeAddr("filler");
    address internal recipient = makeAddr("recipient");
    bytes internal makerKey;

    function test_fee_on_transfer_reverts() public {
        etchPrecompiles();
        MockERC20 tokenIn = new MockERC20("TIN", 18);
        FeeOnTransferToken tokenOut = new FeeOnTransferToken();
        OfferBook book = new OfferBook(address(tokenIn), address(tokenOut));
        makerKey = keyFor(7);
        status.setKey(maker, makerKey, 1, true);
        _fund(tokenIn, book);

        uint256 start_ = 1_000_000;
        uint256 id = _openOn(book, tokenIn, tokenOut, 1 ether, start_, start_ + 2 hours, 0, address(0));
        tokenOut.mint(filler, 100 ether);
        vm.prank(filler);
        tokenOut.approve(address(book), type(uint256).max);
        vm.warp(start_);
        vm.prank(filler);
        vm.expectRevert(OfferBook.Shortfall.selector);
        book.fill(id);
        assertEq(tokenIn.balanceOf(filler), 0);
        assertEq(book.reserved(address(tokenIn)), 1 ether);
    }

    function test_reentrancy_on_fill() public {
        etchPrecompiles();
        ReenterToken tokenIn = new ReenterToken();
        MockERC20 tokenOut = new MockERC20("TOUT", 18);
        OfferBook book = new OfferBook(address(tokenIn), address(tokenOut));
        makerKey = keyFor(8);
        status.setKey(maker, makerKey, 1, true);

        tokenIn.mint(maker, 10 ether);
        vm.startPrank(maker);
        tokenIn.approve(address(book), type(uint256).max);
        book.deposit(address(tokenIn), 10 ether);
        vm.stopPrank();

        uint256 start_ = 1_000_000;
        uint256 id = _openOn(book, tokenIn, tokenOut, 1 ether, start_, start_ + 2 hours, 0, address(0));
        tokenIn.arm(book, id);
        tokenOut.mint(filler, 100 ether);
        vm.prank(filler);
        tokenOut.approve(address(book), type(uint256).max);
        vm.warp(start_);
        vm.prank(filler);
        vm.expectRevert(bytes4(keccak256("ReentrancyGuardReentrantCall()")));
        book.fill(id);
        assertEq(book.reserved(address(tokenIn)), 1 ether);
    }

    function _fund(MockERC20 tokenIn, OfferBook book) internal {
        tokenIn.mint(maker, 10 ether);
        vm.startPrank(maker);
        tokenIn.approve(address(book), type(uint256).max);
        book.deposit(address(tokenIn), 10 ether);
        vm.stopPrank();
    }

    function _openOn(
        OfferBook book,
        MockERC20 tokenIn,
        MockERC20 tokenOut,
        uint256 amount,
        uint256 start_,
        uint256 end_,
        uint256 feeBps,
        address feeRecipient
    ) internal returns (uint256 id) {
        OfferBytes.Offer memory terms = OfferBytes.Offer({
            maker: maker,
            tokenIn: address(tokenIn),
            tokenOut: address(tokenOut),
            amountIn: amount,
            startPrice: 20 ether,
            endPrice: 16 ether,
            startTime: start_,
            endTime: end_,
            recipient: recipient,
            cancelDelay: 40,
            nonce: book.nonces(maker),
            feeBps: feeBps,
            feeRecipient: feeRecipient
        });
        id = book.open(terms, signWith(makerKey, OfferBytes.encodeOffer(terms, address(book))));
    }
}
