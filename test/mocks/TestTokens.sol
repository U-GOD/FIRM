// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {OfferBook} from "../../contracts/OfferBook.sol";

contract MockERC20 {
    string public symbol;
    uint8 public immutable decimals;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory symbol_, uint8 decimals_) {
        symbol = symbol_;
        decimals = decimals_;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external virtual returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external virtual returns (bool) {
        _spend(from, amount);
        _move(from, to, amount);
        return true;
    }

    function _spend(address from, uint256 amount) internal {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
    }

    function _move(address from, address to, uint256 amount) internal virtual {
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}

/// @notice Sends 99 percent and keeps 1 percent. The book's balance check must revert.
contract FeeOnTransferToken is MockERC20 {
    constructor() MockERC20("FEE", 18) {}

    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        _spend(from, amount);
        uint256 skim = amount / 100;
        balanceOf[from] -= amount;
        balanceOf[to] += amount - skim;
        balanceOf[address(this)] += skim;
        return true;
    }
}

/// @notice On transfer, calls fill again. The book must revert.
contract ReenterToken is MockERC20 {
    OfferBook public book;
    uint256 public offerId;
    bool public armed;

    constructor() MockERC20("RE", 18) {}

    function arm(OfferBook book_, uint256 offerId_) external {
        book = book_;
        offerId = offerId_;
        armed = true;
    }

    function transfer(address to, uint256 amount) external override returns (bool) {
        _move(msg.sender, to, amount);
        if (armed) {
            armed = false;
            book.fill(offerId);
        }
        return true;
    }
}
