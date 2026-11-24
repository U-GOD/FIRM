// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Linear price and the payment it implies.
/// Price is output base units per 1e18 input base units.
library Curve {
    uint256 internal constant SCALE = 1e18;
    uint256 internal constant MIN_DURATION = 60;
    uint256 internal constant MAX_DURATION = 7 days;
    uint256 internal constant MIN_CANCEL_DELAY = 1;
    uint256 internal constant MAX_CANCEL_DELAY = 7_200;
    uint256 internal constant MAX_FEE_BPS = 100;

    error UnorderedTime();
    error ZeroPayment();

    function price(uint256 startPrice, uint256 endPrice, uint256 startTime, uint256 endTime, uint256 t)
        internal
        pure
        returns (uint256)
    {
        if (endTime <= startTime) revert UnorderedTime();
        if (t <= startTime) return startPrice;
        if (t >= endTime) return endPrice;
        uint256 elapsed = t - startTime;
        uint256 duration = endTime - startTime;
        if (endPrice >= startPrice) {
            return startPrice + (endPrice - startPrice) * elapsed / duration;
        }
        return startPrice - (startPrice - endPrice) * elapsed / duration;
    }

    /// @dev `unitPrice` is output base units per 1e18 input base units.
    function payment(uint256 amountIn, uint256 unitPrice) internal pure returns (uint256 owed) {
        if (amountIn == 0 || unitPrice == 0) revert ZeroPayment();
        owed = amountIn * unitPrice / SCALE;
        if (owed == 0) revert ZeroPayment();
    }
}
