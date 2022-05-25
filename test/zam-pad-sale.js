const { ethers } = require("hardhat")
const { expect } = require("chai")
const { BigNumber } = require("ethers")
const ethUtil = require("ethereumjs-util")


const SECONDS_PER_DAY = 86400

function increaseTime(time) {
  ethers.provider.send("evm_increaseTime", [time])
  ethers.provider.send("evm_mine")
}

async function latestBlockTimestamp() {
  const blockNumBefore = await ethers.provider.getBlockNumber()
  const blockBefore = await ethers.provider.getBlock(blockNumBefore)
  return blockBefore.timestamp
}

function parseZam(amount) {
  return ethers.utils.parseEther(amount)
}

function parseUsdt(amount) {
  return ethers.utils.parseUnits(amount, 6)
}

async function getValidRounds() {
  const latestTimestamp = await latestBlockTimestamp() + 100
  const startTimes = []
  const endTimes = []
  for (let i = 0; i < 5; ++i) {
    // between whitelist and round1 we need some time to calculate max allocations
    let secondsBetween = i >= 2 ? SECONDS_PER_DAY : 0
    startTimes.push(latestTimestamp + secondsBetween + i * SECONDS_PER_DAY)
    endTimes.push(latestTimestamp + secondsBetween + (i + 1) * SECONDS_PER_DAY)
  }
  return [startTimes, endTimes]
}

function getValidPools() {
  const poolWeights = [10, 20, 20, 12, 12, 10, 8, 8]
  const minRates = [parseZam("2000"), parseZam("10000"), parseZam("30000"), parseZam("80000"),
    parseZam("160000"), parseZam("320000"), parseZam("500000"), parseZam("800000")]
  return [minRates, poolWeights]
}

function getValidAlocations() {
  const withoutNft = [
    parseUsdt("40"),
    parseUsdt("250"),
    parseUsdt("500"),
    parseUsdt("900"),
    parseUsdt("1600"),
    parseUsdt("2800"),
    parseUsdt("4800"),
    parseUsdt("7000"),
  ]
  const withNft = [
    parseUsdt("80"),
    parseUsdt("450"),
    parseUsdt("500"),
    parseUsdt("1170"),
    parseUsdt("1920"),
    parseUsdt("3360"),
    parseUsdt("5760"),
    parseUsdt("8400"),
  ]
  return [withoutNft, withNft]
}

describe("ZamPadSale", async function () {
  let Admin
  let ZamPadSale
  let USDT
  let SalesFactory
  let ZamStaking
  let ZAM
  let owner, alice, bob, carol, wallet, admin, belt1, belt2, belt3, belt4, belt5, belt6, belt7, belt8, mallory

  const saleName = "Troy"
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"
  const AMOUNT_OF_ALLOCATION_TO_SELL = 1000
  const SALE_END_DELTA = 100
  const REGISTRATION_TIME_STARTS_DELTA = 10
  const REGISTRATION_TIME_ENDS_DELTA = 40
  const REGISTRATION_DEPOSIT = 0
  const ROUNDS_START_DELTAS = [50, 70, 90]
  const START_TIMESTAMP_DELTA = 600

  const accounts = await ethers.getSigners()

  beforeEach(async function () {
    owner = accounts[0]
    alice = accounts[1]
    bob = accounts[2]
    carol = accounts[3]
    wallet = accounts[4]
    admin = accounts[5]

    belt1 = accounts[6]
    belt2 = accounts[7]
    belt3 = accounts[8]
    belt4 = accounts[9]
    belt5 = accounts[10]
    belt6 = accounts[11]
    belt7 = accounts[12]
    belt8 = accounts[13]

    mallory = accounts[14]

    let contract = await ethers.getContractFactory("Admin")
    Admin = await contract.deploy([admin.address])

    contract = await ethers.getContractFactory("SalesFactory")
    SalesFactory = await contract.deploy(Admin.address)

    await SalesFactory.connect(admin).createSale()

    contract = await ethers.getContractFactory("ZAMPadSale")
    ZamPadSale = contract.attach(await SalesFactory.sales.call(0, 0))

    contract = await ethers.getContractFactory("TetherToken")
    USDT = await contract.deploy(BigNumber.from("1000000000000000"), "TetherToken", "USDT", BigNumber.from("6"))

    contract = await ethers.getContractFactory("ZamStakingMock")
    ZamStaking = await contract.deploy()

    contract = await ethers.getContractFactory("ZamMock")
    ZAM = await contract.deploy()
  })

  describe("Deploy", async function () {
    it("Should have correct admin", async function () {
      expect(await ZamPadSale.admin()).to.equal(Admin.address)
    })
    it("Should not deploy contract with 0x0 admin address", async function () {
      const contract = await ethers.getContractFactory("ZAMPadSale")
      await expect(contract.deploy(ZERO_ADDRESS)).to.be.revertedWith("ZPS: Address incorrect")
    })
    it("Should set ZamStaking correctly", async function () {
      await ZamPadSale.connect(admin).setZamStaking(ZamStaking.address)
      expect(await ZamPadSale.zamStaking()).to.equal(ZamStaking.address)
    })
    it("Should not set 0x0 ZamStaking address", async function () {
      await expect(ZamPadSale.connect(admin).setZamStaking(ZERO_ADDRESS)).to.be.revertedWith("ZPS: Address incorrect")
    })
    it("Should not init sale if ZamStaking not set", async function () {
      await expect(ZamPadSale.connect(admin).initSale(saleName, USDT.address, parseUsdt("500000"))).to.be.revertedWith("ZPS: zamStaking not set")
    })
    it("Should get paused", async function () {
      expect(await ZamPadSale.isPaused()).to.equal(false)
    })
    it("Should set paused", async function () {
      expect(await ZamPadSale.isPaused()).to.equal(false)
      await ZamPadSale.connect(admin).setPause(true)
      expect(await ZamPadSale.isPaused()).to.equal(true)
    })
    it("Should not set paused if caller is not an admin", async function () {
      expect(await ZamPadSale.isPaused()).to.equal(false)
      await expect(ZamPadSale.connect(mallory).setPause(true)).to.be.revertedWith("ZPS: Only admin")
    })
  })

  describe("Initialize", async function () {
    beforeEach(async function () {
      await ZamPadSale.connect(admin).setZamStaking(ZamStaking.address)
    })
    it("Should init sale correctly", async function () {
      await ZamPadSale.connect(admin).initSale(saleName, USDT.address, parseUsdt("500000"))
      const sale = await ZamPadSale.sale()
      expect(sale.name).to.equal(saleName)
      expect(sale.token).to.equal(USDT.address)
      expect(sale.isInitialized).to.be.true
      expect(sale.allocationTotal).to.equal(parseUsdt("500000"))
    })
    it("Should not init sale if it's already initialized", async function () {
      await ZamPadSale.connect(admin).initSale(saleName, USDT.address, parseUsdt("500000"))
      await expect(ZamPadSale.connect(admin).initSale(saleName, USDT.address, parseUsdt("500000"))).to.be.revertedWith("ZPS: Sale is already created")
    })
    it("Should not init sale if with 0x0 token address", async function () {
      await expect(ZamPadSale.connect(admin).initSale(saleName, ZERO_ADDRESS, parseUsdt("500000"))).to.be.revertedWith("ZPS: Token incorrect")
    })
    it("Should not init sale if name is empty", async function () {
      await expect(ZamPadSale.connect(admin).initSale("", ZERO_ADDRESS, parseUsdt("500000"))).to.be.revertedWith("ZPS: Name empty")
    })
    it("Should not init sale if it's already initialized", async function () {
      await expect(ZamPadSale.connect(admin).initSale(saleName, USDT.address, parseUsdt("0"))).to.be.revertedWith("ZPS: Wrong allocation")
    })
    it("Should not set rounds if sale not initialized", async function () {
      await expect(ZamPadSale.connect(admin).setRounds([], [])).to.be.revertedWith("ZPS: Sale not initialized")
    })
    it("Should not set rounds if sale not initialized", async function () {
      await expect(ZamPadSale.connect(admin).setRounds([], [])).to.be.revertedWith("ZPS: Sale not initialized")
    })
  })

  describe("Preparation", async function () {
    beforeEach(async function () {
      await ZamPadSale.connect(admin).setZamStaking(ZamStaking.address)
      await ZamPadSale.connect(admin).initSale(saleName, USDT.address, parseUsdt("500000"))
    })
    it("Should get current round", async function () {
      // round incorrect, or we are between rounds
      expect(await ZamPadSale.getCurrentRound()).to.equal(0)
      const times = await getValidRounds()
      await ZamPadSale.connect(admin).setRounds(times[0], times[1])
      increaseTime(100)
      expect(await ZamPadSale.getCurrentRound()).to.equal(0)
      increaseTime(SECONDS_PER_DAY)
      expect(await ZamPadSale.getCurrentRound()).to.equal(1)
      increaseTime(SECONDS_PER_DAY)
      // 1 day interval between whitelis and round1
      expect(await ZamPadSale.getCurrentRound()).to.equal(5)
      increaseTime(SECONDS_PER_DAY)
      expect(await ZamPadSale.getCurrentRound()).to.equal(2)
      increaseTime(SECONDS_PER_DAY)
      expect(await ZamPadSale.getCurrentRound()).to.equal(3)
      increaseTime(SECONDS_PER_DAY)
      expect(await ZamPadSale.getCurrentRound()).to.equal(4)
      increaseTime(SECONDS_PER_DAY)
      increaseTime(SECONDS_PER_DAY)
      increaseTime(SECONDS_PER_DAY)
      increaseTime(SECONDS_PER_DAY)
      expect(await ZamPadSale.getCurrentRound()).to.equal(4)
    })
    it("Should set rounds correctly", async function () {
      const times = await getValidRounds()
      await ZamPadSale.connect(admin).setRounds(times[0], times[1])
      const round = await ZamPadSale.rounds(0)
      expect(await ZamPadSale.getRoundsCount()).to.equal(5)
      const result = await ZamPadSale.getRounds()
      expect(result.length).to.equal(5)
      expect(result[0].startTime).to.equal(round.startTime)
    })
    it("Should not set rounds if caller is not admin", async function () {
      const times = await getValidRounds()
      await expect(ZamPadSale.connect(mallory).setRounds(times[0], times[1])).to.be.revertedWith("ZPS: Only admin")
    })
    it("Should not set rounds if not in preparation stage", async function () {
      const times = await getValidRounds()
      await ZamPadSale.connect(admin).setRounds(times[0], times[1])
      increaseTime(100)
      increaseTime(SECONDS_PER_DAY)
      await expect(ZamPadSale.connect(admin).setRounds(times[0], times[1])).to.be.revertedWith("ZPS: Only preparation time")
    })
    it("Should not set rounds if for starttime endtime is not present", async function () {
      const latestTimestamp = await latestBlockTimestamp() + 100
      const startTimes = [latestTimestamp]
      const endTimes = []
      await expect(ZamPadSale.connect(admin).setRounds(startTimes, endTimes)).to.be.revertedWith("ZPS: Wrong params")
    })
    it("Should not set rounds if it's count incorrect", async function () {
      const latestTimestamp = await latestBlockTimestamp() + 100
      const startTimes = [latestTimestamp]
      const endTimes = [latestTimestamp]
      await expect(ZamPadSale.connect(admin).setRounds(startTimes, endTimes)).to.be.revertedWith("ZPS: Wrong rounds count")
    })
    it("Should not set rounds if start time in a past", async function () {
      const latestTimestamp = await latestBlockTimestamp()
      const startTimes = []
      const endTimes = []
      for (let i = 0; i < 5; ++i) {
        // between whitelist and round1 we need some time to calculate max allocations
        let secondsBetween = i >= 2 ? SECONDS_PER_DAY : 0
        startTimes.push(latestTimestamp + secondsBetween + i * SECONDS_PER_DAY)
        endTimes.push(latestTimestamp + secondsBetween + (i + 1) * SECONDS_PER_DAY)
      }
      await expect(ZamPadSale.connect(admin).setRounds(startTimes, endTimes)).to.be.revertedWith("ZPS: start time can't be in past")
    })
    it("Should not set rounds if start time greater than end time", async function () {
      const latestTimestamp = await latestBlockTimestamp() + 100
      const startTimes = []
      const endTimes = []
      for (let i = 0; i < 5; ++i) {
        // between whitelist and round1 we need some time to calculate max allocations
        let secondsBetween = i >= 2 ? SECONDS_PER_DAY : 0
        startTimes.push(latestTimestamp + secondsBetween + i * SECONDS_PER_DAY)
        endTimes.push(latestTimestamp + secondsBetween + i * SECONDS_PER_DAY)
      }
      await expect(ZamPadSale.connect(admin).setRounds(startTimes, endTimes)).to.be.revertedWith("ZPS: start time can't be greater than end time")
    })
    it("Should not set rounds if start time less than prev end time", async function () {
      const latestTimestamp = await latestBlockTimestamp() + 100
      const startTimes = []
      const endTimes = []
      for (let i = 0; i < 5; ++i) {
        // between whitelist and round1 we need some time to calculate max allocations
        let secondsBetween = i >= 2 ? -SECONDS_PER_DAY / 2 : 0
        startTimes.push(latestTimestamp + secondsBetween + i * SECONDS_PER_DAY)
        endTimes.push(latestTimestamp + secondsBetween + (i + 1) * SECONDS_PER_DAY)
      }
      await expect(ZamPadSale.connect(admin).setRounds(startTimes, endTimes)).to.be.revertedWith("ZPS: start time has to be greater than prev round end time")
    })
    it("Should not set rounds if start time less than prev end time", async function () {
      const latestTimestamp = await latestBlockTimestamp() + 100
      const startTimes = []
      const endTimes = []
      for (let i = 0; i < 5; ++i) {
        // between whitelist and round1 we need some time to calculate max allocations
        startTimes.push(latestTimestamp + i * SECONDS_PER_DAY)
        endTimes.push(latestTimestamp + (i + 1) * SECONDS_PER_DAY)
      }
      await expect(ZamPadSale.connect(admin).setRounds(startTimes, endTimes)).to.be.revertedWith("ZPS: at least 1 hour between whitelist and round1")
    })

    it("Should set pools correctly", async function () {
      const pools = getValidPools()
      await ZamPadSale.connect(admin).setPools(pools[0], pools[1])
      const pool = await ZamPadSale.pools(0)
      expect(pool.allocationTotal).to.equal(parseUsdt("50000"))
      expect(await ZamPadSale.getPoolsCount()).to.equal(8)
      const result = await ZamPadSale.getPools()
      expect(result.length).to.equal(8)
      expect(result[0].allocationTotal).to.equal(pool.allocationTotal)
    })
    it("Should not set pools if caller is not admin", async function () {
      const pools = getValidPools()
      await expect(ZamPadSale.connect(mallory).setPools(pools[0], pools[1])).to.be.revertedWith("ZPS: Only admin")
    })
    it("Should not set pools if not in preparation stage", async function () {
      const times = await getValidRounds()
      await ZamPadSale.connect(admin).setRounds(times[0], times[1])
      increaseTime(100)
      increaseTime(SECONDS_PER_DAY)
      const pools = getValidPools()
      await expect(ZamPadSale.connect(admin).setPools(pools[0], pools[1])).to.be.revertedWith("ZPS: Only preparation time")
    })
    it("Should not set pools if it's count incorrect", async function () {
      const poolWeights = [10, 20, 20, 12, 12, 10, 8, 8]
      const minRates = [parseZam("2000"), parseZam("10000"), parseZam("30000"), parseZam("80000"),
        parseZam("160000"), parseZam("320000"), parseZam("500000")]
      await expect(ZamPadSale.connect(admin).setPools(minRates, poolWeights)).to.be.revertedWith("ZPS: Wrong belts count")
    })
    it("Should not set pools if pools incorrect", async function () {
      const poolWeights = [10, 20, 20, 12, 12, 10, 8]
      const minRates = [parseZam("2000"), parseZam("10000"), parseZam("30000"), parseZam("80000"),
        parseZam("160000"), parseZam("320000"), parseZam("500000"), parseZam("800000")]
      await expect(ZamPadSale.connect(admin).setPools(minRates, poolWeights)).to.be.revertedWith("ZPS: Bad input")
    })
    it("Should not set pools if weights sum is not 100", async function () {
      const poolWeights = [10, 20, 20, 12, 12, 10, 8, 7]
      const minRates = [parseZam("2000"), parseZam("10000"), parseZam("30000"), parseZam("80000"),
        parseZam("160000"), parseZam("320000"), parseZam("500000"), parseZam("800000")]
      await expect(ZamPadSale.connect(admin).setPools(minRates, poolWeights)).to.be.revertedWith("ZPS: Wrong weights")
    })
  })

  describe("Whitelist", async function () {
    beforeEach(async function () {
      await ZamPadSale.connect(admin).setZamStaking(ZamStaking.address)
      await ZamPadSale.connect(admin).initSale(saleName, USDT.address, parseUsdt("500000"))
      const times = await getValidRounds();
      await ZamPadSale.connect(admin).setRounds(times[0], times[1])
      const pools = getValidPools()
      await ZamPadSale.connect(admin).setPools(pools[0], pools[1])
      increaseTime(100)
      increaseTime(SECONDS_PER_DAY)
    })
    it("Should not join to whitelist if rounds are not set", async function () {
      await SalesFactory.connect(admin).createSale()
      contract = await ethers.getContractFactory("ZAMPadSale")
      AnySale = contract.attach(await SalesFactory.sales.call(0, 1))
      await AnySale.connect(admin).setZamStaking(ZamStaking.address)
      await AnySale.connect(admin).initSale("Any", USDT.address, parseUsdt("500000"))
      increaseTime(100)
      increaseTime(SECONDS_PER_DAY)
      await expect(AnySale.connect(admin).joinWhitelist(0)).to.be.revertedWith("ZPS: Rounds not set")
    })
    it("Should not join to whitelist if pools are not set", async function () {
      await SalesFactory.connect(admin).createSale()
      contract = await ethers.getContractFactory("ZAMPadSale")
      AnySale = contract.attach(await SalesFactory.sales.call(0, 1))
      await AnySale.connect(admin).setZamStaking(ZamStaking.address)
      await AnySale.connect(admin).initSale("Any", USDT.address, parseUsdt("500000"))
      const times = await getValidRounds();
      await AnySale.connect(admin).setRounds(times[0], times[1])
      increaseTime(100)
      increaseTime(SECONDS_PER_DAY)
      await expect(AnySale.connect(admin).joinWhitelist(0)).to.be.revertedWith("ZPS: Pools not set")
    })
    it("Should not join to whitelist if not in whitelist stage", async function () {
      increaseTime(SECONDS_PER_DAY)
      await ZamStaking.connect(alice).deposit(parseZam("2000"))
      await expect(ZamPadSale.connect(alice).joinWhitelist(0)).to.be.revertedWith("ZPS: Only whitelist time")
    })
    it("Should not join to whitelist twice", async function () {
      await ZamStaking.connect(alice).deposit(parseZam("2000"))
      ZamPadSale.connect(alice).joinWhitelist(0)
      await expect(ZamPadSale.connect(alice).joinWhitelist(0)).to.be.revertedWith("ZPS: User can't join whitelist twice")
    })
    it("Should not join to whitelist if stake is not enough", async function () {
      await expect(ZamPadSale.connect(alice).joinWhitelist(0)).to.be.revertedWith("ZPS: Stake not enough to assign belt")
      await ZamStaking.connect(alice).deposit(parseZam("1000"))
      await expect(ZamPadSale.connect(alice).joinWhitelist(0)).to.be.revertedWith("ZPS: Stake not enough to assign belt")
    })
    it("Should join to whitelist correctly", async function () {
      await ZamStaking.connect(alice).deposit(parseZam("2000"))
      await ZamPadSale.connect(alice).joinWhitelist(1)
      const aliceInfo = await ZamPadSale.registeredUsers(alice.address)
      expect(aliceInfo.belt).to.equal(0)
      expect(aliceInfo.stakedZAM).to.equal(parseZam("2000"))
      expect(aliceInfo.NFT).to.equal(1)
      expect(aliceInfo.allocationBoughtAtRound1).to.equal(0)
      expect(aliceInfo.allocationBoughtAtRound2).to.equal(0)
    })
    it("Should assign belt correctly", async function () {
      const pools = await getValidPools()
      const users = [belt1, belt2, belt3, belt4, belt5, belt6, belt7, belt8]
      for (let i = 0; i < pools[0].length; ++i) {
        await ZamStaking.connect(users[i]).deposit(pools[0][i])
        await ZamPadSale.connect(users[i]).joinWhitelist(i)
        const info = await ZamPadSale.registeredUsers(users[i].address)
        expect(info.belt).to.equal(i)
        let pool = await ZamPadSale.pools(i)
        if (i == 0)
          expect(pool.usersWithoutNft).to.equal(1)
        else
          expect(pool.usersWithNft).to.equal(1)
      }
    })
  })

  describe("After Whitelist and before Round1", async function () {
    beforeEach(async function () {
      await ZamPadSale.connect(admin).setZamStaking(ZamStaking.address)
      await ZamPadSale.connect(admin).initSale(saleName, USDT.address, parseUsdt("5000"))
      const times = await getValidRounds();
      await ZamPadSale.connect(admin).setRounds(times[0], times[1])
      const pools = getValidPools()
      await ZamPadSale.connect(admin).setPools(pools[0], pools[1])
      increaseTime(100)
      increaseTime(SECONDS_PER_DAY)
      await ZamStaking.connect(alice).deposit(parseZam("2000"))
      await ZamPadSale.connect(alice).joinWhitelist(0)
      await ZamStaking.connect(bob).deposit(parseZam("10000"))
      await ZamPadSale.connect(bob).joinWhitelist(1)
      await ZamStaking.connect(carol).deposit(parseZam("30000"))
      await ZamPadSale.connect(carol).joinWhitelist(1)
    })
    it("Should get whitelisted users count", async function () {
      expect(await ZamPadSale.getRegisteredUsersCount()).to.equal(3)
    })
    it("Should get whitelisted users count", async function () {
      const users = await ZamPadSale.connect(admin).getRegisteredUsers(0, 3)
      expect(users[0].stakedZAM).to.equal(parseZam("2000"))
      expect(users[1].stakedZAM).to.equal(parseZam("10000"))
      expect(users[2].stakedZAM).to.equal(parseZam("30000"))
    })
    it("Should set Nfts", async function () {
      increaseTime(SECONDS_PER_DAY)
      let aliceInfo = await ZamPadSale.registeredUsers(alice.address)
      expect(aliceInfo.NFT).to.equal(0)
      await ZamPadSale.connect(admin).setNfts([alice.address], [42])
      aliceInfo = await ZamPadSale.registeredUsers(alice.address)
      expect(aliceInfo.NFT).to.equal(42)
    })
    it("Should not set Nfts if rounds are not set", async function () {
      await SalesFactory.connect(admin).createSale()
      contract = await ethers.getContractFactory("ZAMPadSale")
      AnySale = contract.attach(await SalesFactory.sales.call(0, 1))
      await AnySale.connect(admin).setZamStaking(ZamStaking.address)
      await AnySale.connect(admin).initSale("Any", USDT.address, parseUsdt("500000"))
      increaseTime(100)
      increaseTime(SECONDS_PER_DAY)
      increaseTime(SECONDS_PER_DAY)
      await expect(AnySale.connect(admin).setNfts([alice.address], [42])).to.be.revertedWith("ZPS: Rounds not set")
    })
    it("Should not set Nfts if stage incorrect", async function () {
      increaseTime(SECONDS_PER_DAY)
      increaseTime(SECONDS_PER_DAY)
      await expect(ZamPadSale.connect(admin).setNfts([alice.address], [42])).to.be.revertedWith("ZPS: Only before public sale time")
    })
    it("Should not set Nfts if caller is not admin", async function () {
      increaseTime(SECONDS_PER_DAY)
      await expect(ZamPadSale.connect(alice).setNfts([alice.address], [42])).to.be.revertedWith("ZPS: Only admin")
    })
    it("Should set Nfts if user is not registered", async function () {
      increaseTime(SECONDS_PER_DAY)
      let malloryInfo = await ZamPadSale.registeredUsers(mallory.address)
      expect(malloryInfo.stakedZAM).to.equal(0)
      await expect(ZamPadSale.connect(admin).setNfts([mallory.address], [42])).to.be.revertedWith("ZPS: User not registered")
    })
    it("Should set Nfts if params wrong", async function () {
      increaseTime(SECONDS_PER_DAY)
      await expect(ZamPadSale.connect(admin).setNfts([], [42])).to.be.revertedWith("ZPS: Wrong data")
      await expect(ZamPadSale.connect(admin).setNfts([alice.address], [])).to.be.revertedWith("ZPS: Wrong data")
    })
    it("Should not calculate max allocations if caller not admin", async function () {
      increaseTime(SECONDS_PER_DAY)
      const allocations = getValidAlocations()
      await expect(ZamPadSale.connect(alice).calculateMaxAllocations(allocations[0], allocations[1])).to.be.revertedWith("ZPS: Only admin")
    })
    it("Should not calculate max allocations if stage incorrect", async function () {
      increaseTime(SECONDS_PER_DAY)
      increaseTime(SECONDS_PER_DAY)
      const allocations = getValidAlocations()
      await expect(ZamPadSale.connect(admin).calculateMaxAllocations(allocations[0], allocations[1])).to.be.revertedWith("ZPS: Only before public sale time")
    })
    it("Should not calculate max allocations if caller not admin", async function () {
      increaseTime(SECONDS_PER_DAY)
      const allocations = getValidAlocations()
      await expect(ZamPadSale.connect(alice).calculateMaxAllocations(allocations[0], allocations[1])).to.be.revertedWith("ZPS: Only admin")
    })
    it("Should not calculate max allocations if allocations incorrect", async function () {
      increaseTime(SECONDS_PER_DAY)
      const allocations = getValidAlocations()
      await expect(ZamPadSale.connect(admin).calculateMaxAllocations([0], allocations[1])).to.be.revertedWith("ZPS: Wrong data")
    })
    it("Should not calculate max allocations if allocations has wrong belts", async function () {
      increaseTime(SECONDS_PER_DAY)
      await expect(ZamPadSale.connect(admin).calculateMaxAllocations([0], [0])).to.be.revertedWith("ZPS: Wrong length")
    })
    it("Should calculate max allocations if belt allocation enough", async function () {
      increaseTime(SECONDS_PER_DAY)
      const allocations = getValidAlocations()
      await ZamPadSale.connect(admin).calculateMaxAllocations(allocations[0], allocations[1])
      for (let i = 0; i < allocations[0].length; ++i) {
        const pool = await ZamPadSale.pools(i)
        expect(pool.maxAllocationGuaranteedWithoutNft).to.equal(allocations[0][i])
        expect(pool.maxAllocationGuaranteedWithNft).to.equal(allocations[1][i])
      }
    })
    it("Should calculate max allocations if belt allocation not enough", async function () {
      for (let i = 5; i < 17; ++i) {
        await ZamStaking.connect(accounts[i]).deposit(parseZam("2000"))
        if (i < 8)
          await ZamPadSale.connect(accounts[i]).joinWhitelist(1)
        else
          await ZamPadSale.connect(accounts[i]).joinWhitelist(0)
      }
      increaseTime(SECONDS_PER_DAY)
      const allocations = getValidAlocations()
      await ZamPadSale.connect(admin).calculateMaxAllocations(allocations[0], allocations[1])
      const pool = await ZamPadSale.pools(0)
      expect(pool.maxAllocationGuaranteedWithoutNft).to.equal(parseUsdt("31.25"))
      expect(pool.maxAllocationGuaranteedWithNft).to.equal(parseUsdt("62.5"))
    })
  })

  describe("Round1", async function () {
    beforeEach(async function () {
      await ZamPadSale.connect(admin).setZamStaking(ZamStaking.address)
      await ZamPadSale.connect(admin).initSale(saleName, USDT.address, parseUsdt("5000"))
      const times = await getValidRounds();
      await ZamPadSale.connect(admin).setRounds(times[0], times[1])
      const pools = getValidPools()
      await ZamPadSale.connect(admin).setPools(pools[0], pools[1])
      increaseTime(100)
      increaseTime(SECONDS_PER_DAY)
      await ZamStaking.connect(alice).deposit(parseZam("2000"))
      await ZamPadSale.connect(alice).joinWhitelist(0)
      await ZamStaking.connect(bob).deposit(parseZam("10000"))
      await ZamPadSale.connect(bob).joinWhitelist(1)
      await ZamStaking.connect(carol).deposit(parseZam("30000"))
      await ZamPadSale.connect(carol).joinWhitelist(1)
      increaseTime(SECONDS_PER_DAY)
      const allocations = getValidAlocations()
      await ZamPadSale.connect(admin).calculateMaxAllocations(allocations[0], allocations[1])
      increaseTime(SECONDS_PER_DAY)
    })
    it("Should not participate if rounds are not set", async function () {
      await SalesFactory.connect(admin).createSale()
      contract = await ethers.getContractFactory("ZAMPadSale")
      AnySale = contract.attach(await SalesFactory.sales.call(0, 1))
      await AnySale.connect(admin).setZamStaking(ZamStaking.address)
      await AnySale.connect(admin).initSale("Any", USDT.address, parseUsdt("500000"))
      increaseTime(100)
      increaseTime(SECONDS_PER_DAY)
      increaseTime(SECONDS_PER_DAY)
      increaseTime(SECONDS_PER_DAY)
      await expect(AnySale.connect(alice).participate(0)).to.be.revertedWith("ZPS: Rounds not set")
    })
    it("Should not participate if not in round1 stage or pools are not set", async function () {
      await SalesFactory.connect(admin).createSale()
      contract = await ethers.getContractFactory("ZAMPadSale")
      AnySale = contract.attach(await SalesFactory.sales.call(0, 1))
      await AnySale.connect(admin).setZamStaking(ZamStaking.address)
      await AnySale.connect(admin).initSale("Any", USDT.address, parseUsdt("500000"))
      const times = await getValidRounds();
      await AnySale.connect(admin).setRounds(times[0], times[1])
      increaseTime(100)
      increaseTime(SECONDS_PER_DAY)
      increaseTime(SECONDS_PER_DAY)
      await expect(AnySale.connect(alice).participate(0)).to.be.revertedWith("ZPS: Only public sale time")
      increaseTime(SECONDS_PER_DAY)
      await expect(AnySale.connect(alice).participate(0)).to.be.revertedWith("ZPS: Pools not set")
    })
    it("Should not participate if pools are not set", async function () {
      await expect(ZamPadSale.connect(alice).participate(0)).to.be.revertedWith("ZPS: Wrong amount")
    })
    it("Should not participate if allowance not enogh", async function () {
      await USDT.transfer(alice.address, parseUsdt("40"))
      await USDT.connect(alice).approve(ZamPadSale.address, parseUsdt("35"))
      await expect(ZamPadSale.connect(alice).participate(parseUsdt("40"))).to.be.revertedWith("ZPS: Wrong allowance")
    })
    it("Should not participate if user not in whitelist", async function () {
      await USDT.transfer(mallory.address, parseUsdt("40"))
      await USDT.connect(mallory).approve(ZamPadSale.address, parseUsdt("40"))
      await expect(ZamPadSale.connect(mallory).participate(parseUsdt("40"))).to.be.revertedWith("ZPS: Not in whitelist")
    })
    it("Should not participate if max amount reached", async function () {
      await USDT.transfer(alice.address, parseUsdt("40"))
      await USDT.connect(alice).approve(ZamPadSale.address, parseUsdt("40.000001"))
      await ZamPadSale.connect(alice).participate(parseUsdt("40"))
      await expect(ZamPadSale.connect(alice).participate(parseUsdt("0.000001"))).to.be.revertedWith("ZPS: Max amount reached")
    })
    it("Should not participate from if caller not an admin", async function () {
      await expect(ZamPadSale.connect(alice).participateFrom(alice.address, parseUsdt("0.000001"))).to.be.revertedWith("ZPS: Only admin")
    })
    it("Should not participate if contract paused", async function () {
      await ZamPadSale.connect(admin).setPause(true)
      await USDT.transfer(alice.address, parseUsdt("40"))
      await USDT.connect(alice).approve(ZamPadSale.address, parseUsdt("40"))
      await expect(ZamPadSale.connect(alice).participate(parseUsdt("40"))).to.be.revertedWith("ZPS: Paused")
    })
    it("Should participate", async function () {
      await USDT.transfer(alice.address, parseUsdt("40"))
      await USDT.connect(alice).approve(ZamPadSale.address, parseUsdt("40"))
      await ZamPadSale.connect(alice).participate(parseUsdt("40"))
      const sale = await ZamPadSale.sale()
      expect(sale.allocationSold).to.equal(parseUsdt("40"))
      const pool = await ZamPadSale.pools(0)
      expect(pool.allocationSold).to.equal(parseUsdt("40"))
      let aliceInfo = await ZamPadSale.registeredUsers(alice.address)
      expect(aliceInfo.allocationBoughtAtRound1).to.equal(parseUsdt("40"))
      expect(await USDT.balanceOf(ZamPadSale.address)).to.equal(parseUsdt("40"))
    })
    it("Should participate from if contract paused", async function () {
      await ZamPadSale.connect(admin).setPause(true)
      await USDT.transfer(alice.address, parseUsdt("40"))
      await USDT.connect(alice).approve(ZamPadSale.address, parseUsdt("40"))
      await expect(ZamPadSale.connect(admin).participateFrom(alice.address, parseUsdt("40"))).to.be.revertedWith("ZPS: Paused")
    })
    it("Should participate from", async function () {
      await USDT.transfer(alice.address, parseUsdt("40"))
      await USDT.connect(alice).approve(ZamPadSale.address, parseUsdt("40"))
      await ZamPadSale.connect(admin).participateFrom(alice.address, parseUsdt("40"))
      const sale = await ZamPadSale.sale()
      expect(sale.allocationSold).to.equal(parseUsdt("40"))
      const pool = await ZamPadSale.pools(0)
      expect(pool.allocationSold).to.equal(parseUsdt("40"))
      let aliceInfo = await ZamPadSale.registeredUsers(alice.address)
      expect(aliceInfo.allocationBoughtAtRound1).to.equal(parseUsdt("40"))
      expect(await USDT.balanceOf(ZamPadSale.address)).to.equal(parseUsdt("40"))
    })
  })
  
  describe("Round2", async function () {
    beforeEach(async function () {
      await ZamPadSale.connect(admin).setZamStaking(ZamStaking.address)
      await ZamPadSale.connect(admin).initSale(saleName, USDT.address, parseUsdt("500000"))
      const times = await getValidRounds();
      // add interval between round1 and round2
      times[0][3] += 360
      times[1][3] += 360
      times[0][4] += 360
      times[1][4] += 360
      await ZamPadSale.connect(admin).setRounds(times[0], times[1])
      const pools = getValidPools()
      await ZamPadSale.connect(admin).setPools(pools[0], pools[1])
      increaseTime(100)
      increaseTime(SECONDS_PER_DAY)
      await ZamStaking.connect(belt1).deposit(parseZam("2000"))
      await ZamPadSale.connect(belt1).joinWhitelist(0)
      await ZamStaking.connect(belt2).deposit(parseZam("10000"))
      await ZamPadSale.connect(belt2).joinWhitelist(1)
      await ZamStaking.connect(belt7).deposit(parseZam("500000"))
      await ZamPadSale.connect(belt7).joinWhitelist(0)
      await ZamStaking.connect(belt8).deposit(parseZam("800000"))
      await ZamPadSale.connect(belt8).joinWhitelist(1)
      increaseTime(SECONDS_PER_DAY)
      const allocations = getValidAlocations()
      await ZamPadSale.connect(admin).calculateMaxAllocations(allocations[0], allocations[1])
      increaseTime(SECONDS_PER_DAY)
      await USDT.transfer(belt1.address, parseUsdt("309570.000001"))
      await USDT.connect(belt1).approve(ZamPadSale.address, parseUsdt("309570.000001"))
      await ZamPadSale.connect(belt1).participate(parseUsdt("40"))
      await USDT.transfer(belt2.address, parseUsdt("450"))
      await USDT.connect(belt2).approve(ZamPadSale.address, parseUsdt("450"))
      await ZamPadSale.connect(belt2).participate(parseUsdt("430"))
      await USDT.transfer(belt7.address, parseUsdt("181620"))
      await USDT.connect(belt7).approve(ZamPadSale.address, parseUsdt("181620"))
      await ZamPadSale.connect(belt7).participate(parseUsdt("4800"))
      await USDT.transfer(belt8.address, parseUsdt("8400"))
      await USDT.connect(belt8).approve(ZamPadSale.address, parseUsdt("8400"))
      await ZamPadSale.connect(belt8).participate(parseUsdt("8380"))
      increaseTime(36)
    })
    it("Should get correct belt", async function () {
      // belt 8, should get 7
      expect(await ZamPadSale.getBelt(belt8.address)).to.equal(7)
      // belt not exist, should get 8
      expect(await ZamPadSale.getBelt(mallory.address)).to.equal(8)
    })
    it("Should not participate if round2 is not started", async function () {
      increaseTime(SECONDS_PER_DAY)
      await expect(ZamPadSale.connect(belt2).participate(parseUsdt("1"))).to.be.revertedWith("ZPS: Round not started")
    })
    it("Should not participate if user didn't bought his allocation at round1", async function () {
      increaseTime(SECONDS_PER_DAY)
      increaseTime(SECONDS_PER_DAY)
      await expect(ZamPadSale.connect(belt2).participate(parseUsdt("1"))).to.be.revertedWith("ZPS: User can't participate at round")
    })
    it("Should not participate if user not enough allocation", async function () {
      increaseTime(SECONDS_PER_DAY)
      increaseTime(SECONDS_PER_DAY)
      await ZamPadSale.connect(belt1).participate(parseUsdt("309530"))
      await expect(ZamPadSale.connect(belt1).participate(parseUsdt("0.000001"))).to.be.revertedWith("ZPS: Not enough allocation")
    })
    it("Should get available allocation at round2", async function () {
      expect(await ZamPadSale.getAvailableAllocationAtRound2(belt1.address)).to.equal(parseUsdt("309530"))
      expect(await ZamPadSale.getAvailableAllocationAtRound2(belt2.address)).to.equal(0)
      expect(await ZamPadSale.getAvailableAllocationAtRound2(belt7.address)).to.equal(parseUsdt("176820"))
      expect(await ZamPadSale.getAvailableAllocationAtRound2(belt8.address)).to.equal(0)
    })
    it("Should participate", async function () {
      increaseTime(SECONDS_PER_DAY)
      increaseTime(SECONDS_PER_DAY)
      await ZamPadSale.connect(belt1).participate(parseUsdt("309530"))
      let sale = await ZamPadSale.sale()
      expect(sale.allocationSold).to.equal(parseUsdt("323180"))
      await ZamPadSale.connect(belt7).participate(parseUsdt("176820"))
      sale = await ZamPadSale.sale()
      expect(sale.allocationSold).to.equal(parseUsdt("500000"))
      for (let i = 0; i < 8; ++i) {
        const pool = await ZamPadSale.pools(i)
        expect(pool.allocationSold).to.equal(pool.allocationTotal)
      }
      let info = await ZamPadSale.registeredUsers(belt1.address)
      expect(info.allocationBoughtAtRound1).to.equal(parseUsdt("40"))
      expect(info.allocationBoughtAtRound2).to.equal(parseUsdt("309530"))
      expect(await USDT.balanceOf(ZamPadSale.address)).to.equal(parseUsdt("500000"))
    })
    it("Should not participate if all allocations sold", async function () {
      increaseTime(SECONDS_PER_DAY)
      increaseTime(SECONDS_PER_DAY)
      await ZamPadSale.connect(belt1).participate(parseUsdt("309530"))
      await ZamPadSale.connect(belt7).participate(parseUsdt("176820"))
      const sale = await ZamPadSale.sale()
      expect(sale.allocationSold).to.equal(sale.allocationTotal)
      await expect(ZamPadSale.connect(belt1).participate(parseUsdt("0.000001"))).to.be.revertedWith("ZPS: Not enough allocation")
    })
  })
  
  describe("Distribution", async function () {
    beforeEach(async function () {
      await ZamPadSale.connect(admin).setZamStaking(ZamStaking.address)
      await ZamPadSale.connect(admin).initSale(saleName, USDT.address, parseUsdt("500000"))
      const times = await getValidRounds();
      await ZamPadSale.connect(admin).setRounds(times[0], times[1])
      const pools = getValidPools()
      await ZamPadSale.connect(admin).setPools(pools[0], pools[1])
      increaseTime(100)
      increaseTime(SECONDS_PER_DAY)
      await ZamStaking.connect(belt1).deposit(parseZam("2000"))
      await ZamPadSale.connect(belt1).joinWhitelist(0)
      await ZamStaking.connect(belt2).deposit(parseZam("10000"))
      await ZamPadSale.connect(belt2).joinWhitelist(1)
      await ZamStaking.connect(belt7).deposit(parseZam("500000"))
      await ZamPadSale.connect(belt7).joinWhitelist(0)
      await ZamStaking.connect(belt8).deposit(parseZam("800000"))
      await ZamPadSale.connect(belt8).joinWhitelist(1)
      increaseTime(SECONDS_PER_DAY)
      const allocations = getValidAlocations()
      await ZamPadSale.connect(admin).calculateMaxAllocations(allocations[0], allocations[1])
      increaseTime(SECONDS_PER_DAY)
      await USDT.transfer(belt1.address, parseUsdt("190000"))
      await USDT.connect(belt1).approve(ZamPadSale.address, parseUsdt("190000"))
      await ZamPadSale.connect(belt1).participate(parseUsdt("40"))
      increaseTime(SECONDS_PER_DAY)
      await ZamPadSale.connect(belt1).participate(parseUsdt("189960"))
    })
    it("Should not withdraw if rounds are not set", async function () {
      await SalesFactory.connect(admin).createSale()
      contract = await ethers.getContractFactory("ZAMPadSale")
      AnySale = contract.attach(await SalesFactory.sales.call(0, 1))
      await AnySale.connect(admin).setZamStaking(ZamStaking.address)
      await AnySale.connect(admin).initSale("Any", USDT.address, parseUsdt("500000"))
      increaseTime(100)
      increaseTime(SECONDS_PER_DAY)
      increaseTime(SECONDS_PER_DAY)
      increaseTime(SECONDS_PER_DAY)
      increaseTime(SECONDS_PER_DAY)
      await expect(AnySale.connect(admin).withdraw(admin.address)).to.be.revertedWith("ZPS: Rounds not set")
    })
    it("Should not withdraw if caller is not an admin", async function () {
      await expect(ZamPadSale.connect(mallory).withdraw(mallory.address)).to.be.revertedWith("ZPS: Only admin")
    })
    it("Should not withdraw if round2 is not started", async function () {
      await expect(ZamPadSale.connect(admin).withdraw(admin.address)).to.be.revertedWith("ZPS: Only distribution time")
    })
    it("Should not withdraw address incorrect", async function () {
      increaseTime(SECONDS_PER_DAY)
      await expect(ZamPadSale.connect(admin).withdraw(ZERO_ADDRESS)).to.be.revertedWith("ZPS: Address incorrect")
    })
    it("Should withdraw", async function () {
      increaseTime(SECONDS_PER_DAY)
      await ZamPadSale.connect(admin).withdraw(wallet.address)
      expect(await USDT.balanceOf(wallet.address)).to.equal(parseUsdt("190000"))
    })
    it("Should withdraw after distribution ends", async function () {
      increaseTime(SECONDS_PER_DAY * 42)
      await ZamPadSale.connect(admin).withdraw(wallet.address)
      expect(await USDT.balanceOf(wallet.address)).to.equal(parseUsdt("190000"))
    })
  })

  describe("Lifecycle test", async function () {
    it("Should proceed correctly", async function () {
      await ZamPadSale.connect(admin).setZamStaking(ZamStaking.address)
      expect(await ZamPadSale.zamStaking()).to.equal(ZamStaking.address)

      await ZamPadSale.connect(admin).initSale(saleName, USDT.address, parseUsdt("500000"))
      let sale = await ZamPadSale.sale()
      expect(sale.token).to.equal(USDT.address)
      expect(sale.isInitialized).to.be.true
      expect(sale.allocationTotal).to.equal(parseUsdt("500000"))

      await USDT.transfer(alice.address, parseUsdt("80"))
      await USDT.connect(alice).approve(ZamPadSale.address, parseUsdt("80"))
      await USDT.transfer(bob.address, parseUsdt("450"))
      await USDT.connect(bob).approve(ZamPadSale.address, parseUsdt("450"))
      await USDT.transfer(carol.address, parseUsdt("1600"))
      await USDT.connect(carol).approve(ZamPadSale.address, parseUsdt("1600"))

      await ZamStaking.connect(alice).deposit(parseZam("2000"))
      await ZamStaking.connect(bob).deposit(parseZam("10000"))
      await ZamStaking.connect(carol).deposit(parseZam("160000"))
      const latestTimestamp = await latestBlockTimestamp() + 100

      const startTimes = []
      const endTimes = []
      for (let i = 0; i < 5; ++i) {
        // between whitelist and round1 we need some time to calculate max allocations
        let secondsBetween = i >= 2 ? SECONDS_PER_DAY : 0
        startTimes.push(latestTimestamp + secondsBetween + i * SECONDS_PER_DAY)
        endTimes.push(latestTimestamp + secondsBetween + (i + 1) * SECONDS_PER_DAY)
      }

      await ZamPadSale.connect(admin).setRounds(startTimes, endTimes)

      const poolWeights = [
        BigNumber.from("10"),
        BigNumber.from("20"),
        BigNumber.from("20"),
        BigNumber.from("12"),
        BigNumber.from("12"),
        BigNumber.from("10"),
        BigNumber.from("8"),
        BigNumber.from("8")
      ]
  
      const minRates = [
        parseZam("2000"),
        parseZam("10000"),
        parseZam("30000"),
        parseZam("80000"),
        parseZam("160000"),
        parseZam("320000"),
        parseZam("500000"),
        parseZam("800000")
      ]

      await ZamPadSale.connect(admin).setPools(minRates, poolWeights)

      // proceed to preparation
      increaseTime(100)

      // proceed to whitelist
      increaseTime(SECONDS_PER_DAY)

      await ZamPadSale.connect(alice).joinWhitelist(BigNumber.from("0"))
      let aliceInfo = await ZamPadSale.registeredUsers(alice.address)
      expect(aliceInfo.belt).to.equal(0)
      expect(aliceInfo.stakedZAM).to.equal(parseZam("2000"))
      expect(aliceInfo.NFT).to.equal(0)
      expect(aliceInfo.allocationBoughtAtRound1).to.equal(0)
      expect(aliceInfo.allocationBoughtAtRound2).to.equal(0)

      await ZamPadSale.connect(bob).joinWhitelist(BigNumber.from("1"))
      let bobInfo = await ZamPadSale.registeredUsers(bob.address)
      expect(bobInfo.belt).to.equal(1)
      expect(bobInfo.stakedZAM).to.equal(parseZam("10000"))
      expect(bobInfo.NFT).to.equal(1)

      await ZamPadSale.connect(carol).joinWhitelist(BigNumber.from("0"))
      let carolInfo = await ZamPadSale.registeredUsers(carol.address)
      expect(carolInfo.belt).to.equal(4)
      expect(carolInfo.stakedZAM).to.equal(parseZam("160000"))
      expect(carolInfo.NFT).to.equal(0)

      // proceed to time between whitelist and round1
      increaseTime(SECONDS_PER_DAY)
      const withoutNft = [
        parseUsdt("40"),
        parseUsdt("250"),
        parseUsdt("500"),
        parseUsdt("900"),
        parseUsdt("1600"),
        parseUsdt("2800"),
        parseUsdt("4800"),
        parseUsdt("7000"),
      ]
      const withNft = [
        parseUsdt("80"),
        parseUsdt("450"),
        parseUsdt("500"),
        parseUsdt("1170"),
        parseUsdt("1920"),
        parseUsdt("3360"),
        parseUsdt("5760"),
        parseUsdt("8400"),
      ]
      await ZamPadSale.connect(admin).calculateMaxAllocations(withoutNft, withNft)
      let whiteBelt = await ZamPadSale.pools(0)
      expect(whiteBelt.maxAllocationGuaranteedWithoutNft).to.equal(parseUsdt("40"))
      expect(whiteBelt.maxAllocationGuaranteedWithNft).to.equal(parseUsdt("80"))      
      let yellowBelt = await ZamPadSale.pools(1)
      expect(yellowBelt.maxAllocationGuaranteedWithoutNft).to.equal(parseUsdt("250"))
      expect(yellowBelt.maxAllocationGuaranteedWithNft).to.equal(parseUsdt("450"))      
      let blueBelt = await ZamPadSale.pools(4)
      expect(blueBelt.maxAllocationGuaranteedWithoutNft).to.equal(parseUsdt("1600"))
      expect(blueBelt.maxAllocationGuaranteedWithNft).to.equal(parseUsdt("1920"))

      // proceed to round1
      increaseTime(SECONDS_PER_DAY)
      await ZamPadSale.connect(alice).participate(parseUsdt("40"))
      await ZamPadSale.connect(bob).participate(parseUsdt("250"))
      await ZamPadSale.connect(carol).participate(parseUsdt("1560"))
      aliceInfo = await ZamPadSale.registeredUsers(alice.address)
      expect(aliceInfo.allocationBoughtAtRound1).to.equal(parseUsdt("40"))
      expect(aliceInfo.allocationBoughtAtRound2).to.equal(0)
      bobInfo = await ZamPadSale.registeredUsers(bob.address)
      expect(bobInfo.allocationBoughtAtRound1).to.equal(parseUsdt("250"))
      expect(bobInfo.allocationBoughtAtRound2).to.equal(0)
      carolInfo = await ZamPadSale.registeredUsers(carol.address)
      expect(carolInfo.allocationBoughtAtRound1).to.equal(parseUsdt("1560"))
      expect(carolInfo.allocationBoughtAtRound2).to.equal(0)

      sale = await ZamPadSale.sale()
      expect(sale.allocationSold).to.equal(parseUsdt("1850"))

      // proceed to round2
      increaseTime(SECONDS_PER_DAY)
      await expect(ZamPadSale.connect(bob).participate(parseUsdt("200"))).to.be.revertedWith("ZPS: User can't participate at round")
      await ZamPadSale.connect(alice).participate(parseUsdt("40"))

      // proceed to distribution
      increaseTime(SECONDS_PER_DAY)
      sale = await ZamPadSale.sale()
      await ZamPadSale.connect(admin).withdraw(wallet.address)
      expect(await USDT.balanceOf(wallet.address)).to.equal(sale.allocationSold).to.equal(parseUsdt("1890"))
    })
  })

  // describe("Set sale parameters", async function() {
  //     const blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp
  //     const token = UsdtToken.address
  //     const wallet = wallet.address
  //     const registrationDeposit = REGISTRATION_DEPOSIT
  //     const allocationTotal = AMOUNT_OF_ALLOCATION_TO_SELL
  //     const saleEnd = blockTimestamp + SALE_END_DELTA

  //     // When
  //     await ZamPadSale.setSaleParams(token, allocationTotal, saleEnd, wallet, registrationDeposit)

  //     // Then
  //     const sale = await ZamPadSale.sale()
  //     expect(sale.token).to.equal(token)
  //     expect(sale.isInitialized).to.be.true
  //     expect(sale.allocationTotal).to.equal(allocationTotal)
  //     expect(sale.saleEnd).to.equal(saleEnd)
  //     expect(sale.wallet).to.equal(wallet)

  //     const registrationDepositSale = await ZamPadSale.registrationDeposit()
  //     expect(registrationDepositSale).to.equal(registrationDeposit)

  //     // expect(await SalesFactory.saleOwnerToSale(saleOwner)).to.equal(AvalaunchSale.address)

  // })
  // })


})