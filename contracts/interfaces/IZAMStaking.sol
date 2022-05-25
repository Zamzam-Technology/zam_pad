//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

interface IZamStaking {
    function userInfo(address user) external view returns (uint256, uint256);
}