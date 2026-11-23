// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Canonical bytes for an offer, a cancel, and a withdraw.
/// The precompile verifies these bytes. It does not hash them first.
library OfferBytes {
    bytes32 internal constant OFFER_DOMAIN = keccak256("FIRM_OFFER_V1");
    bytes32 internal constant CANCEL_DOMAIN = keccak256("FIRM_CANCEL_V1");
    bytes32 internal constant WITHDRAW_DOMAIN = keccak256("FIRM_WITHDRAW_V1");

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
        uint256 cancelDelay;
        uint256 nonce;
        uint256 feeBps;
        address feeRecipient;
    }

    struct Cancel {
        uint256 offerId;
        address maker;
        uint256 actionNonce;
    }

    struct Withdraw {
        address maker;
        address token;
        uint256 amount;
        uint256 actionNonce;
    }

    function encodeOffer(Offer memory offer, address book) internal view returns (bytes memory) {
        return encodeOffer(offer, book, block.chainid);
    }

    function encodeOffer(Offer memory offer, address book, uint256 chainId) internal pure returns (bytes memory) {
        return abi.encode(
            OFFER_DOMAIN,
            chainId,
            book,
            offer.maker,
            offer.tokenIn,
            offer.tokenOut,
            offer.amountIn,
            offer.startPrice,
            offer.endPrice,
            offer.startTime,
            offer.endTime,
            offer.recipient,
            offer.cancelDelay,
            offer.nonce,
            offer.feeBps,
            offer.feeRecipient
        );
    }

    function encodeCancel(Cancel memory cancel_, address book) internal view returns (bytes memory) {
        return encodeCancel(cancel_, book, block.chainid);
    }

    function encodeCancel(Cancel memory cancel_, address book, uint256 chainId) internal pure returns (bytes memory) {
        return abi.encode(CANCEL_DOMAIN, chainId, book, cancel_.offerId, cancel_.maker, cancel_.actionNonce);
    }

    function encodeWithdraw(Withdraw memory withdrawal, address book) internal view returns (bytes memory) {
        return encodeWithdraw(withdrawal, book, block.chainid);
    }

    function encodeWithdraw(Withdraw memory withdrawal, address book, uint256 chainId)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encode(
            WITHDRAW_DOMAIN,
            chainId,
            book,
            withdrawal.maker,
            withdrawal.token,
            withdrawal.amount,
            withdrawal.actionNonce
        );
    }
}
