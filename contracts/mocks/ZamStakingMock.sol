// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;


contract ZamStakingMock {

    struct UserInfo {
        uint256 amount;
        uint256 rewardDebt;
    }

    mapping(address => UserInfo) public userInfo;

    constructor () {

    }

    function deposit(uint256 _amount) external {
        userInfo[msg.sender].amount = _amount;
    }

}