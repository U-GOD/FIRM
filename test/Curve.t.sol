// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Curve} from "../contracts/libraries/Curve.sol";

contract CurveHarness {
    function price(uint256 startPrice, uint256 endPrice, uint256 startTime, uint256 endTime, uint256 t)
        external
        pure
        returns (uint256)
    {
        return Curve.price(startPrice, endPrice, startTime, endTime, t);
    }

    function payment(uint256 amountIn, uint256 unitPrice) external pure returns (uint256) {
        return Curve.payment(amountIn, unitPrice);
    }
}

contract CurveTest is Test {
    CurveHarness internal harness;

    function setUp() public {
        harness = new CurveHarness();
    }

    function test_midpoint_falls_two_points() public pure {
        uint256 start = 1_000_000;
        uint256 end = start + 2 hours;
        uint256 got = Curve.price(20 ether, 16 ether, start, end, start + 1 hours);
        assertEq(got, 18 ether);
    }

    function test_endpoints_and_outside() public pure {
        uint256 start = 1_000_000;
        uint256 end = start + 2 hours;
        assertEq(Curve.price(20 ether, 16 ether, start, end, start), 20 ether);
        assertEq(Curve.price(20 ether, 16 ether, start, end, end), 16 ether);
        assertEq(Curve.price(20 ether, 16 ether, start, end, start - 1), 20 ether);
        assertEq(Curve.price(20 ether, 16 ether, start, end, end + 1), 16 ether);
    }

    function test_payment_scales_by_one_e18() public pure {
        assertEq(Curve.payment(10 ether, 18 ether), 180 ether);
        assertEq(Curve.payment(1 ether, 20_000_000), 20_000_000 * 1 ether / 1e18);
    }

    function test_zero_duration_reverts() public {
        vm.expectRevert(Curve.UnorderedTime.selector);
        harness.price(1, 1, 10, 10, 10);
    }

    function test_zero_payment_reverts() public {
        vm.expectRevert(Curve.ZeroPayment.selector);
        harness.payment(1, 1);
    }

    function testFuzz_curve_stays_inside_endpoints(
        uint128 startPrice,
        uint128 endPrice,
        uint64 startTime,
        uint32 duration,
        uint256 t
    ) public pure {
        vm.assume(startPrice > 0 && endPrice > 0);
        uint256 span = uint256(duration) + 60;
        vm.assume(span <= 7 days);
        uint256 endTime = uint256(startTime) + span;
        uint256 got = Curve.price(startPrice, endPrice, startTime, endTime, t);
        uint256 lo = startPrice < endPrice ? startPrice : endPrice;
        uint256 hi = startPrice > endPrice ? startPrice : endPrice;
        assertGe(got, lo);
        assertLe(got, hi);
    }
}
