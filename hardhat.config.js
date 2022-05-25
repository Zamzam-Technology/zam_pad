require("@nomiclabs/hardhat-waffle");
require("solidity-coverage");

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  networks: {
    hardhat: {
      gas: 12000000,
      blockGasLimit: 0x1fffffffffffff,
      allowUnlimitedContractSize: true,
      timeout: 1800000,
      accounts: {
        count: 20
      }
    }
  },
  solidity: {
    compilers: [
      {
        version: "0.4.17"
      },
      {
        version: "0.8.1"
      }
    ],
    overrides: {
      "./contracts/mocks/USDTFlattened.sol": {
        version: "0.4.17",
        settings: { }
      }
    }
  },
  mocha: {
    timeout: 300000
  }
};
