// "SPDX-License-Identifier: UNLICENSED"
pragma solidity ^0.8.0;

import "../interfaces/IAdmin.sol";
import "./ZAMPadSale.sol";


contract SalesFactory {

    IAdmin public admin;

    mapping(address => bool) public isSaleCreatedByFactory;

    address[] public sales;

    event SaleDeployed(address saleContract);

    modifier onlyAdmin {
        require(admin.isAdmin(msg.sender), "SalesFactory: Only Admin can deploy sales");
        _;
    }

    constructor (address _adminContract) {
        admin = IAdmin(_adminContract);
    }

    function createSale() external onlyAdmin {
        ZAMPadSale sale = new ZAMPadSale(address(admin));
        isSaleCreatedByFactory[address(sale)] = true;
        sales.push(address(sale));
        emit SaleDeployed(address(sale));
    }

    // Function to return number of pools deployed
    function getSalesCount() external view returns (uint) {
        return sales.length;
    }

}
