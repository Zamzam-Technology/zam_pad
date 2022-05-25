//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

contract Admin {

    uint256 public possibleAdminsCount = 2;

    // Listing all admins
    address[] public admins;

    mapping(address => bool) public isAdmin;

    // Modifier restricting access to only admin
    modifier onlyAdmin {
        require(isAdmin[msg.sender], "Admin: Only admin can call");
        _;
    }

    // Constructor to set initial admins during deployment
    constructor (address[] memory _admins) {
        require(_admins.length <= possibleAdminsCount, "Admin: not possible admins count");
        for(uint i = 0; i < _admins.length; i++) {
            admins.push(_admins[i]);
            isAdmin[_admins[i]] = true;
        }
    }

    function addAdmin(address _address) external onlyAdmin {
        require(admins.length < possibleAdminsCount, "Admin: max admins count reached");
        // Can't add 0x address as an admin
        require(_address != address(0x0), "Admin: Zero address given");
        // Can't add existing admin
        require(!isAdmin[_address], "Admin: Admin already exists");
        // Add admin to array of admins
        admins.push(_address);
        // Set mapping
        isAdmin[_address] = true;
    }

    function removeAdmin(address _address) external onlyAdmin {
        require(isAdmin[_address], "Admin: admin is not exist");
        require(admins.length > 1, "Admin: Can't remove all admins since contract becomes unusable");

        for (uint256 i = 0; i < admins.length; ++i) {
            if (admins[i] == _address) {
                isAdmin[_address] = false;
                admins[i] = admins[admins.length - 1];
                admins.pop();
                break;
            }
        }
    }

    function getAdminsCount() external view returns (uint256) {
        return admins.length;
    }

    // Fetch all admins
    function getAllAdmins() external view returns (address [] memory) {
        return admins;
    }

}