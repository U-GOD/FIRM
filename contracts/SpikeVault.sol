// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice Throwaway for the deposit spike. Pulls `amount` of `token` from the caller.
contract SpikeVault {
    event Deposited(address indexed maker, address indexed token, uint256 amount);

    function deposit(address token, uint256 amount) external {
        require(amount > 0, "zero");
        emit Deposited(msg.sender, token, amount);
        require(IERC20(token).transferFrom(msg.sender, address(this), amount), "transfer");
    }
}
