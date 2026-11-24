// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {OfferBook} from "../contracts/OfferBook.sol";
import {Curve} from "../contracts/libraries/Curve.sol";
import {OfferBytes} from "../contracts/libraries/OfferBytes.sol";
import {PqcMock} from "./mocks/PqcMock.sol";
import {MockERC20} from "./mocks/TestTokens.sol";

/// forge-config: default.invariant.runs = 32
/// forge-config: default.invariant.depth = 12
/// forge-config: default.invariant.fail_on_revert = false
contract OfferBookInvariantTest is Test {
    OfferHandler internal handler;

    function setUp() public {
        handler = new OfferHandler();
        targetContract(address(handler));
    }

    function invariant_balance_matches_idle_plus_reserved() public view {
        OfferBook book = handler.book();
        MockERC20 tokenIn = handler.tokenIn();
        MockERC20 tokenOut = handler.tokenOut();
        address maker = handler.maker();
        assertEq(
            tokenIn.balanceOf(address(book)),
            book.reserved(address(tokenIn)) + book.idle(maker, address(tokenIn))
        );
        assertEq(
            tokenOut.balanceOf(address(book)),
            book.reserved(address(tokenOut)) + book.idle(maker, address(tokenOut))
        );
    }
}

contract OfferHandler is Test {
    address internal constant STATUS = 0x0000000000000000000000000000000000000a02;
    address internal constant VERIFY = 0x0000000000000000000000000000000000000a01;

    OfferBook public book;
    MockERC20 public tokenIn;
    MockERC20 public tokenOut;
    address public maker;
    address public filler;
    address public recipient;
    bytes internal makerKey;
    uint256 public activeId;

    constructor() {
        PqcMock impl = new PqcMock();
        vm.etch(STATUS, address(impl).code);
        vm.etch(VERIFY, address(impl).code);
        PqcMock status = PqcMock(STATUS);
        PqcMock verify = PqcMock(VERIFY);
        status.setActive(true);
        verify.setActive(true);

        tokenIn = new MockERC20("TIN", 18);
        tokenOut = new MockERC20("TOUT", 18);
        book = new OfferBook(address(tokenIn), address(tokenOut));
        maker = makeAddr("maker");
        filler = makeAddr("filler");
        recipient = makeAddr("recipient");
        makerKey = _key(1);
        status.setKey(maker, makerKey, 1, true);

        tokenOut.mint(filler, 1_000_000 ether);
        vm.prank(filler);
        tokenOut.approve(address(book), type(uint256).max);
    }

    function deposit(uint96 raw) external {
        uint256 amount = bound(raw, 1, 20 ether);
        tokenIn.mint(maker, amount);
        vm.startPrank(maker);
        tokenIn.approve(address(book), amount);
        book.deposit(address(tokenIn), amount);
        vm.stopPrank();
    }

    function open() external {
        if (activeId != 0) return;
        uint256 idleBal = book.idle(maker, address(tokenIn));
        if (idleBal < 2) return;
        uint256 amount = idleBal / 2;
        uint256 start_ = block.timestamp;
        OfferBytes.Offer memory terms = OfferBytes.Offer({
            maker: maker,
            tokenIn: address(tokenIn),
            tokenOut: address(tokenOut),
            amountIn: amount,
            startPrice: 20 ether,
            endPrice: 16 ether,
            startTime: start_,
            endTime: start_ + 1 days,
            recipient: recipient,
            cancelDelay: 40,
            nonce: book.nonces(maker),
            feeBps: 0,
            feeRecipient: address(0)
        });
        activeId = book.open(terms, _sign(OfferBytes.encodeOffer(terms, address(book))));
    }

    function fill() external {
        if (activeId == 0) return;
        (,,, uint256 amountIn,,, uint256 start_, uint256 end_,,,,,,) = book.offers(activeId);
        if (block.timestamp < start_ || block.timestamp > end_) return;
        uint256 price = Curve.price(20 ether, 16 ether, start_, end_, block.timestamp);
        uint256 gross = Curve.payment(amountIn, price);
        if (tokenOut.balanceOf(filler) < gross) return;
        vm.prank(filler);
        book.fill(activeId);
        activeId = 0;
    }

    function startCancel() external {
        if (activeId == 0) return;
        bytes memory message = OfferBytes.encodeCancel(
            OfferBytes.Cancel({offerId: activeId, maker: maker, actionNonce: book.actionNonces(maker)}), address(book)
        );
        book.startCancel(activeId, _sign(message));
    }

    function finalizeCancel() external {
        if (activeId == 0) return;
        (,,,,,,,,,,,, uint64 ready,) = book.offers(activeId);
        if (ready == 0) return;
        vm.roll(ready);
        book.finalizeCancel(activeId);
        activeId = 0;
    }

    function withdrawIdle(uint96 raw) external {
        uint256 idleBal = book.idle(maker, address(tokenIn));
        if (idleBal == 0) return;
        uint256 amount = bound(raw, 1, idleBal);
        bytes memory message = OfferBytes.encodeWithdraw(
            OfferBytes.Withdraw({maker: maker, token: address(tokenIn), amount: amount, actionNonce: book.actionNonces(maker)}),
            address(book)
        );
        book.withdraw(maker, address(tokenIn), amount, _sign(message));
    }

    function classicalCancel() external {
        if (activeId == 0) return;
        uint256 reservedBefore = book.reserved(address(tokenIn));
        uint256 idleBefore = book.idle(maker, address(tokenIn));
        try book.startCancel(activeId, _junk()) {
            assertTrue(false, "classical cancel");
        } catch {}
        assertEq(book.reserved(address(tokenIn)), reservedBefore);
        assertEq(book.idle(maker, address(tokenIn)), idleBefore);
    }

    function classicalWithdraw(uint96 raw) external {
        uint256 bal = tokenIn.balanceOf(address(book));
        uint256 idleBefore = book.idle(maker, address(tokenIn));
        try book.withdraw(maker, address(tokenIn), bound(raw, 0, 100 ether), _junk()) {
            assertTrue(false, "classical withdraw");
        } catch {}
        assertEq(tokenIn.balanceOf(address(book)), bal);
        assertEq(book.idle(maker, address(tokenIn)), idleBefore);
    }

    function _sign(bytes memory message) internal view returns (bytes memory sig) {
        bytes32 digest = keccak256(abi.encode(makerKey, keccak256(message)));
        sig = new bytes(4627);
        assembly {
            mstore(add(sig, 32), digest)
        }
    }

    function _junk() internal pure returns (bytes memory sig) {
        sig = new bytes(4627);
        sig[0] = 0x11;
    }

    function _key(uint256 salt) internal pure returns (bytes memory pubkey) {
        pubkey = new bytes(2592);
        for (uint256 i; i < 2592; i += 32) {
            bytes32 word = keccak256(abi.encode(salt, i));
            assembly {
                mstore(add(add(pubkey, 32), i), word)
            }
        }
    }
}
