// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IQorePQC} from "./interfaces/IQorePQC.sol";
import {Curve} from "./libraries/Curve.sol";
import {OfferBytes} from "./libraries/OfferBytes.sol";

/// @notice One pair. Inventory in, payment out, price from the signed line.
/// There is no owner. The maker is the ML-DSA key, not msg.sender.
/// An empty precompile return reverts. This build does not treat mainnet as safe.
contract OfferBook is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 internal constant SIG_LENGTH = 4627;
    uint256 internal constant KEY_LENGTH = 2592;
    uint8 internal constant ML_DSA_87 = 1;
    address internal constant PQC_VERIFY = 0x0000000000000000000000000000000000000a01;
    address internal constant PQC_STATUS = 0x0000000000000000000000000000000000000a02;

    enum Status {
        None,
        Open,
        Filled,
        CancelPending,
        Cancelled
    }

    struct Offer {
        address maker;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 startPrice;
        uint256 endPrice;
        uint256 startTime;
        uint256 endTime;
        address recipient;
        uint64 cancelDelay;
        uint16 feeBps;
        address feeRecipient;
        uint64 cancelReadyAt;
        Status status;
    }

    error BadToken();
    error BadTerms();
    error BadSignature();
    error BadKey();
    error PrecompileInactive();
    error StaleNonce();
    error NotOpen();
    error TooEarly();
    error TooLate();
    error CancelWaiting();
    error NothingToCredit();
    error Shortfall();

    address public immutable tokenA;
    address public immutable tokenB;

    uint256 public nextId = 1;
    mapping(uint256 id => Offer offer) public offers;
    mapping(address maker => mapping(address token => uint256 amount)) public idle;
    mapping(address token => uint256 amount) public reserved;
    mapping(address maker => uint256 nonce) public nonces;
    mapping(address maker => uint256 nonce) public actionNonces;

    event Deposited(address indexed maker, address indexed token, uint256 amount);
    event OfferOpened(uint256 indexed id, address indexed maker, bytes32 termsHash);
    event Filled(uint256 indexed id, address indexed filler, uint256 price, uint256 gross, uint256 fee);
    event CancelStarted(uint256 indexed id, uint256 readyAt);
    event Cancelled(uint256 indexed id);
    event Withdrawn(address indexed maker, address indexed token, uint256 amount);

    constructor(address tokenA_, address tokenB_) {
        if (tokenA_ == address(0) || tokenB_ == address(0) || tokenA_ == tokenB_) revert BadToken();
        tokenA = tokenA_;
        tokenB = tokenB_;
    }

    /// @notice Credit the caller. There is no depositFor.
    function deposit(address token, uint256 amount) external {
        if (!_allowed(token)) revert BadToken();
        if (amount == 0) revert NothingToCredit();
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        idle[msg.sender][token] += amount;
        emit Deposited(msg.sender, token, amount);
    }

    /// @notice Store a signed offer. msg.sender pays gas and is not the maker.
    function open(OfferBytes.Offer calldata terms, bytes calldata signature) external returns (uint256 id) {
        _checkTerms(terms);
        if (terms.nonce != nonces[terms.maker]) revert StaleNonce();
        if (idle[terms.maker][terms.tokenIn] < terms.amountIn) revert Shortfall();

        bytes memory message = OfferBytes.encodeOffer(terms, address(this));
        _verify(terms.maker, message, signature);

        nonces[terms.maker] = terms.nonce + 1;
        idle[terms.maker][terms.tokenIn] -= terms.amountIn;
        reserved[terms.tokenIn] += terms.amountIn;

        id = nextId++;
        offers[id] = Offer({
            maker: terms.maker,
            tokenIn: terms.tokenIn,
            tokenOut: terms.tokenOut,
            amountIn: terms.amountIn,
            startPrice: terms.startPrice,
            endPrice: terms.endPrice,
            startTime: terms.startTime,
            endTime: terms.endTime,
            recipient: terms.recipient,
            cancelDelay: uint64(terms.cancelDelay),
            feeBps: uint16(terms.feeBps),
            feeRecipient: terms.feeRecipient,
            cancelReadyAt: 0,
            status: Status.Open
        });
        emit OfferOpened(id, terms.maker, keccak256(message));
    }

    /// @notice Pay the curve for the whole input amount. The caller does not choose the price.
    function fill(uint256 id) external nonReentrant {
        Offer storage offer = offers[id];
        if (offer.status != Status.Open && offer.status != Status.CancelPending) revert NotOpen();
        if (offer.cancelReadyAt != 0 && block.number >= offer.cancelReadyAt) revert NotOpen();
        if (block.timestamp < offer.startTime) revert TooEarly();
        if (block.timestamp > offer.endTime) revert TooLate();

        uint256 unitPrice =
            Curve.price(offer.startPrice, offer.endPrice, offer.startTime, offer.endTime, block.timestamp);
        uint256 gross = Curve.payment(offer.amountIn, unitPrice);
        uint256 fee = gross * offer.feeBps / 10_000;
        uint256 toRecipient = gross - fee;

        offer.status = Status.Filled;
        reserved[offer.tokenIn] -= offer.amountIn;

        address filler = msg.sender;
        IERC20(offer.tokenIn).safeTransfer(filler, offer.amountIn);
        _pull(offer.tokenOut, filler, offer.recipient, toRecipient);
        if (fee != 0) _pull(offer.tokenOut, filler, offer.feeRecipient, fee);

        emit Filled(id, filler, unitPrice, gross, fee);
    }

    /// @notice Start the delay the maker signed. Fills stay valid until that block.
    function startCancel(uint256 id, bytes calldata signature) external {
        Offer storage offer = offers[id];
        if (offer.status != Status.Open || offer.cancelReadyAt != 0) revert NotOpen();

        bytes memory message = OfferBytes.encodeCancel(
            OfferBytes.Cancel({offerId: id, maker: offer.maker, actionNonce: actionNonces[offer.maker]}), address(this)
        );
        _verify(offer.maker, message, signature);

        actionNonces[offer.maker] += 1;
        offer.status = Status.CancelPending;
        offer.cancelReadyAt = uint64(block.number) + offer.cancelDelay;
        emit CancelStarted(id, offer.cancelReadyAt);
    }

    /// @notice After the delay, return the unsold input to the maker's idle balance.
    function finalizeCancel(uint256 id) external nonReentrant {
        Offer storage offer = offers[id];
        if (offer.status != Status.CancelPending) revert NotOpen();
        if (block.number < offer.cancelReadyAt) revert CancelWaiting();

        offer.status = Status.Cancelled;
        reserved[offer.tokenIn] -= offer.amountIn;
        idle[offer.maker][offer.tokenIn] += offer.amountIn;
        emit Cancelled(id);
    }

    /// @notice Send idle tokens to the maker named in the signature, not to msg.sender.
    /// @dev The maker argument is the account the signature must name. A wrong address fails the check.
    function withdraw(address maker, address token, uint256 amount, bytes calldata signature) external nonReentrant {
        if (!_allowed(token)) revert BadToken();
        if (amount == 0) revert NothingToCredit();
        if (idle[maker][token] < amount) revert Shortfall();

        bytes memory message = OfferBytes.encodeWithdraw(
            OfferBytes.Withdraw({maker: maker, token: token, amount: amount, actionNonce: actionNonces[maker]}),
            address(this)
        );
        _verify(maker, message, signature);

        actionNonces[maker] += 1;
        idle[maker][token] -= amount;
        IERC20(token).safeTransfer(maker, amount);
        emit Withdrawn(maker, token, amount);
    }

    function _checkTerms(OfferBytes.Offer calldata terms) internal view {
        if (terms.amountIn == 0 || terms.startPrice == 0 || terms.endPrice == 0) revert BadTerms();
        if (terms.endTime <= terms.startTime) revert BadTerms();
        uint256 duration = terms.endTime - terms.startTime;
        if (duration < Curve.MIN_DURATION || duration > Curve.MAX_DURATION) revert BadTerms();
        if (terms.cancelDelay < Curve.MIN_CANCEL_DELAY || terms.cancelDelay > Curve.MAX_CANCEL_DELAY) {
            revert BadTerms();
        }
        if (terms.feeBps > Curve.MAX_FEE_BPS) revert BadTerms();
        if (terms.feeBps == 0) {
            if (terms.feeRecipient != address(0)) revert BadTerms();
        } else if (terms.feeRecipient == address(0) || terms.feeRecipient == address(this)) {
            revert BadTerms();
        }
        if (terms.recipient == address(0) || terms.recipient == address(this)) revert BadTerms();
        if (terms.tokenIn == terms.tokenOut || !_pair(terms.tokenIn, terms.tokenOut)) revert BadTerms();
    }

    function _verify(address account, bytes memory message, bytes calldata signature) internal view {
        if (signature.length != SIG_LENGTH) revert BadSignature();

        (bool statusOk, bytes memory statusRet) =
            PQC_STATUS.staticcall(abi.encodeCall(IQorePQC.pqcKeyStatus, (account)));
        if (!statusOk || statusRet.length < 160) revert PrecompileInactive();

        (bool registered, uint8 algorithmId, bytes memory pubkey, bool possessionProven) =
            abi.decode(statusRet, (bool, uint8, bytes, bool));
        if (!registered || algorithmId != ML_DSA_87 || !possessionProven || pubkey.length != KEY_LENGTH) {
            revert BadKey();
        }

        (bool verifyOk, bytes memory verifyRet) =
            PQC_VERIFY.staticcall(abi.encodeCall(IQorePQC.pqcVerify, (pubkey, signature, message)));
        if (!verifyOk || verifyRet.length < 32) revert PrecompileInactive();
        if (!abi.decode(verifyRet, (bool))) revert BadSignature();
    }

    function _pull(address token, address from, address to, uint256 amount) internal {
        uint256 beforeBal = IERC20(token).balanceOf(to);
        IERC20(token).safeTransferFrom(from, to, amount);
        if (IERC20(token).balanceOf(to) - beforeBal != amount) revert Shortfall();
    }

    function _allowed(address token) internal view returns (bool) {
        return token == tokenA || token == tokenB;
    }

    function _pair(address tokenIn, address tokenOut) internal view returns (bool) {
        return (tokenIn == tokenA && tokenOut == tokenB) || (tokenIn == tokenB && tokenOut == tokenA);
    }
}
