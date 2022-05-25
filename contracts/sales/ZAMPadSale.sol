// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../interfaces/IAdmin.sol";
import "../interfaces/IZAMStaking.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";


contract ZAMPadSale is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Belts { WHITE, YELLOW, ORANGE, GREEN, BLUE, BROWN, BLACK, RED, COUNT }
    enum Rounds { PREPARATION, WHITELIST, ROUND1, ROUND2, DISTRIBUTION, COUNT }

    struct Sale {
        // name
        string name;
        // token to buy allocations
        IERC20 token;
        // is sale created
        bool isInitialized;
        // allocation total
        uint256 allocationTotal;
        // Total allocation being sold
        uint256 allocationSold;
    }

    // Round structure
    struct Round {
        // round start datetime
        uint256 startTime;
        // round end datetime
        uint256 endTime;
    }

    struct BeltPool {
        // ZAM needed to get belt
        uint256 minStakedZAM;
        // allocation total available by belt
        uint256 allocationTotal;
        // allocation sold by belt
        uint256 allocationSold;
        // registered users
        uint256 usersWithoutNft;
        // registered users with nft
        uint256 usersWithNft;
        // maximum guaranteed allocation wthout nft
        uint256 maxAllocationGuaranteedWithoutNft;
        // maximum guaranteed allocation wth nft
        uint256 maxAllocationGuaranteedWithNft;
    }

    // struct user detail
    struct RegisteredUser {
        Belts belt;
        uint256 stakedZAM;
        uint256 NFT;
        uint256 allocationBoughtAtRound1;
        uint256 allocationBoughtAtRound2;
        address userAddress;
    }

    // Sale
    Sale public sale;
    // Rounds
    Round[] public rounds;
    // Belts pools
    BeltPool[] public pools;
    // User details
    mapping(address => RegisteredUser) public registeredUsers;
    address[] private _users;
    // Admin contract
    IAdmin public admin;
    // ZamStaking address
    IZamStaking public zamStaking;
    // paused
    bool private _paused;

    modifier onlyAdmin() {
        require(admin.isAdmin(msg.sender), "ZPS: Only admin");
        _;
    }

    modifier onlyAtPreparationTime() {
        require(rounds.length == 0 || block.timestamp < rounds[uint256(Rounds.PREPARATION)].endTime, "ZPS: Only preparation time");
        _;
    }

    modifier onlyAtWhitelistTime() {
        require(rounds.length == uint256(Rounds.COUNT), "ZPS: Rounds not set");
        require(block.timestamp >= rounds[uint256(Rounds.WHITELIST)].startTime &&
            block.timestamp < rounds[uint256(Rounds.WHITELIST)].endTime, "ZPS: Only whitelist time");
        _;
    }

    modifier onlyBetweenWhitelistAndRound1Time() {
        require(rounds.length == uint256(Rounds.COUNT), "ZPS: Rounds not set");
        require(block.timestamp >= rounds[uint256(Rounds.WHITELIST)].endTime &&
            block.timestamp < rounds[uint256(Rounds.ROUND1)].startTime, "ZPS: Only before public sale time");
        _;
    }

    modifier onlyAtRound1Round2Time() {
        require(rounds.length == uint256(Rounds.COUNT), "ZPS: Rounds not set");
        require(block.timestamp >= rounds[uint256(Rounds.ROUND1)].startTime &&
            block.timestamp < rounds[uint256(Rounds.ROUND2)].endTime, "ZPS: Only public sale time");
        _;
    }

    modifier onlyAtDistributionTime() {
        require(rounds.length == uint256(Rounds.COUNT), "ZPS: Rounds not set");
        require(block.timestamp >= rounds[uint256(Rounds.DISTRIBUTION)].startTime, "ZPS: Only distribution time");
        _;
    }

    modifier whenNotPaused() {
        require(!isPaused(), "ZPS: Paused");
        _;
    }

    // Constructor, always initialized through SalesFactory
    constructor (address _admin) {
        require(_admin != address(0), "ZPS: Address incorrect");
        admin = IAdmin(_admin);
        _paused = false;
    }

    function setPause(bool paused_) external onlyAdmin {
        _paused = paused_;
    }

    function setZamStaking(address address_) external onlyAdmin {
        require(address_ != address(0), "ZPS: Address incorrect");
        zamStaking = IZamStaking(address_);
    }

    // Admin function to set sale parameters
    function initSale(string memory name_, address token_, uint256 allocationTotal_) external onlyAdmin {
        require(bytes(name_).length > 0, "ZPS: Name empty");
        require(address(zamStaking) != address(0), "ZPS: zamStaking not set");
        require(!sale.isInitialized, "ZPS: Sale is already created");
        require(token_ != address(0), "ZPS: Token incorrect");
        require(allocationTotal_ != 0, "ZPS: Wrong allocation");

        // Set params
        sale.name = name_;
        sale.token = IERC20(token_);
        sale.isInitialized = true;
        sale.allocationTotal = allocationTotal_;
    }

    // Five rounds total:
    // 1. Preparation: The project is being under preparation. 
    // 2. Whitelist: Users can join the whitelist after completing the tasks to get Guaranteed Allocation.
    // 3. ROUND 1: Guaranteed registeredUsers can participate in the token sale. 
    // 4. ROUND 2: Sale of unredeemed tokens in the first round for 4–8 belts by model FCFS. 
    // 5. Distribution and Сlaim: Tokens are distributed among the participants of the sale.
    function setRounds(uint256[] calldata startTimes, uint256[] calldata endTimes) external onlyAdmin onlyAtPreparationTime {
        require(sale.isInitialized, "ZPS: Sale not initialized");
        require(startTimes.length == endTimes.length, "ZPS: Wrong params");
        require(startTimes.length == uint256(Rounds.COUNT), "ZPS: Wrong rounds count");

        delete rounds;
        
        for (uint256 i = 0; i < startTimes.length; i++) {
            require(startTimes[i] >= block.timestamp, "ZPS: start time can't be in past");
            require(startTimes[i] < endTimes[i], "ZPS: start time can't be greater than end time");
            if (i >= 1)
                require(startTimes[i] >= endTimes[i - 1], "ZPS: start time has to be greater than prev round end time");
            if (i == 2)
                require(startTimes[i] - endTimes[i - 1] >= 300, "ZPS: at least 1 hour between whitelist and round1");

            Round memory round = Round(startTimes[i], endTimes[i]);

            rounds.push(round);
        }
    }

    function setPools(uint256[] calldata minRates, uint256[] calldata poolWeights) external onlyAdmin onlyAtPreparationTime {
        require(minRates.length == uint256(Belts.COUNT), "ZPS: Wrong belts count");
        require(minRates.length == poolWeights.length, "ZPS: Bad input");

        delete pools;

        uint256 totalWeight = 0;
        for (uint256 i = 0; i < poolWeights.length; i++) {
            BeltPool memory pool = BeltPool(minRates[i], (sale.allocationTotal * poolWeights[i]) / 100, 0, 0, 0, 0, 0);

            pools.push(pool);

            totalWeight += poolWeights[i];
        }
        require(totalWeight == 100, "ZPS: Wrong weights");
    }

    // Registration for sale
    function joinWhitelist(uint256 nftBalance) external onlyAtWhitelistTime nonReentrant {
        require(pools.length != 0, "ZPS: Pools not set");
        require(registeredUsers[msg.sender].stakedZAM == 0, "ZPS: User can't join whitelist twice");

        (uint256 staked,) = zamStaking.userInfo(msg.sender);

        Belts belt = _getBeltByStaked(staked);
        require(belt != Belts.COUNT, "ZPS: Stake not enough to assign belt");

        if (nftBalance > 0)
            pools[uint256(belt)].usersWithNft += 1;
        else
            pools[uint256(belt)].usersWithoutNft += 1;

        registeredUsers[msg.sender].stakedZAM = staked;
        registeredUsers[msg.sender].NFT = nftBalance;
        registeredUsers[msg.sender].belt = belt;

        _users.push(msg.sender);
    }

    function setNfts(address[] memory users_, uint256[] memory counts_) external onlyAdmin onlyBetweenWhitelistAndRound1Time {
        require(users_.length > 0 && users_.length == counts_.length, "ZPS: Wrong data");
        for (uint256 i = 0; i < users_.length; i++) {
            require(registeredUsers[users_[i]].stakedZAM > 0, "ZPS: User not registered");
            registeredUsers[users_[i]].NFT = counts_[i];
        }
    }

    function calculateMaxAllocations(uint256[] memory guaranteedWithoutNft, uint256[] memory guaranteedWithNft) external onlyAdmin onlyBetweenWhitelistAndRound1Time {
        require(guaranteedWithoutNft.length == guaranteedWithNft.length, "ZPS: Wrong data");
        require(guaranteedWithoutNft.length == uint256(Belts.COUNT), "ZPS: Wrong length");

        for (uint256 i = 0; i < pools.length; i++) {
            BeltPool storage pool = pools[i];
            uint256 neededAllocation = (guaranteedWithoutNft[i] * pool.usersWithoutNft) + (guaranteedWithNft[i] * pool.usersWithNft);
            if (neededAllocation > pool.allocationTotal) {
                uint256 multiplier = (pool.allocationTotal * 10**18) / neededAllocation;
                pool.maxAllocationGuaranteedWithoutNft = (guaranteedWithoutNft[i] * multiplier) / 10**18;
                pool.maxAllocationGuaranteedWithNft = (guaranteedWithNft[i] * multiplier) / 10**18;
            } else {
                pool.maxAllocationGuaranteedWithoutNft = guaranteedWithoutNft[i];
                pool.maxAllocationGuaranteedWithNft = guaranteedWithNft[i];
            }
        }
    }

    function participateFrom(address participant, uint256 amount) external onlyAdmin whenNotPaused onlyAtRound1Round2Time {
        _participate(participant, amount);
    }

    // Function to participate in the sales
    function participate(uint256 amount) external nonReentrant whenNotPaused onlyAtRound1Round2Time {
        _participate(msg.sender, amount);
    }

    function withdraw(address creator) external onlyAdmin onlyAtDistributionTime {
        require(creator != address(0), "ZPS: Address incorrect");
        sale.token.safeTransfer(creator, sale.allocationSold);
    }

    function getAvailableAllocationAtRound2(address participant) external view returns (uint256) {
        uint256 maxAvailableAllocationAtRound1 = registeredUsers[participant].NFT > 0
            ? pools[uint256(registeredUsers[participant].belt)].maxAllocationGuaranteedWithNft
            : pools[uint256(registeredUsers[participant].belt)].maxAllocationGuaranteedWithoutNft;
        if (registeredUsers[participant].allocationBoughtAtRound1 < maxAvailableAllocationAtRound1)
            return 0;
        (uint256 k, uint256 count) = _getAvailablePoolsAtRound2(participant);
        uint256 availableAllocationAtRound2;
        // WHITE, YELLOW, ORANGE, GREEN can buy not bought BLUE, BROWN, BLACK, RED, COUNT allocation and vice versa  
        for (uint256 i = k; i < k + count; ++i) {
            availableAllocationAtRound2 += pools[i].allocationTotal - pools[i].allocationSold;
        }
        return availableAllocationAtRound2;
    }

    function getRounds() external view returns (Round[] memory) {
        return rounds;
    }

    function getRoundsCount() external view returns (uint256) {
        return rounds.length;
    }

    // return correct round only within round, otherwise return Rounds.COUNT
    function getCurrentRound() external view returns (uint256 roundId) {
        roundId = rounds.length == 0 ? 0 : uint256(Rounds.COUNT);
        for (uint256 i = 0; i < rounds.length; ++i) {
            if (block.timestamp >= rounds[i].startTime && block.timestamp < rounds[i].endTime) {
                roundId = i;
                break;
            }
        }
        roundId = rounds.length != 0 && block.timestamp >= rounds[rounds.length - 1].endTime ? rounds.length - 1 : roundId;
    }

    function getPools() external view returns (BeltPool[] memory) {
        return pools;
    }

    function getPoolsCount() external view returns (uint256) {
        return pools.length;
    }

    function getRegisteredUsers(uint256 start, uint256 count) external onlyAdmin view returns (RegisteredUser[] memory) {
        RegisteredUser[] memory users_ =  new RegisteredUser[](count);
        for (uint256 i = start; i < start + count; ++i) {
            RegisteredUser memory d = registeredUsers[_users[i]];
            d.userAddress = _users[i];
            users_[i] = d;
        }
        return users_;
    }

    function getRegisteredUsersCount() external view returns (uint256) {
        return _users.length;
    }

    function getBelt(address user) external view returns (Belts belt) {
        (uint256 staked,) = zamStaking.userInfo(user);
        belt = _getBeltByStaked(staked);
    }

    function isPaused() public view returns (bool) {
        return _paused;
    }

    function _participate(address participant, uint256 amount) internal {
        require(pools.length != 0, "ZPS: Pools not set");
        require(amount > 0, "ZPS: Wrong amount");
        // Check available allocations
        require((sale.allocationSold + amount) <= sale.allocationTotal, "ZPS: Not enough allocation");
        // Check token available
        require(sale.token.allowance(participant, address(this)) >= amount, "ZPS: Wrong allowance");
        // User must have registered for the
        require(registeredUsers[participant].stakedZAM > 0, "ZPS: Not in whitelist");

        uint256 maxAvailableAllocationAtRound1 = registeredUsers[participant].NFT > 0
            ? pools[uint256(registeredUsers[participant].belt)].maxAllocationGuaranteedWithNft
            : pools[uint256(registeredUsers[participant].belt)].maxAllocationGuaranteedWithoutNft;

        if (block.timestamp < rounds[uint256(Rounds.ROUND1)].endTime) {
            require(registeredUsers[participant].allocationBoughtAtRound1 + amount <= maxAvailableAllocationAtRound1,
                "ZPS: Max amount reached");
            pools[uint256(registeredUsers[participant].belt)].allocationSold = pools[uint256(registeredUsers[participant].belt)].allocationSold + amount;
            registeredUsers[participant].allocationBoughtAtRound1 = registeredUsers[participant].allocationBoughtAtRound1 + amount;
        } else if (block.timestamp >= rounds[uint256(Rounds.ROUND2)].startTime) {
            require(registeredUsers[participant].allocationBoughtAtRound1 == maxAvailableAllocationAtRound1,
                "ZPS: User can't participate at round");
            (uint256 k, uint256 count) = _getAvailablePoolsAtRound2(participant);
            uint256 notFilled = amount;
            // WHITE, YELLOW, ORANGE, GREEN can buy not bought BLUE, BROWN, BLACK, RED, COUNT allocation and vice versa  
            for (uint256 i = k; i < (k + count); ++i) {
                pools[i].allocationSold = pools[i].allocationSold + notFilled;
                if (pools[i].allocationSold > pools[i].allocationTotal) {
                    notFilled = pools[i].allocationSold - pools[i].allocationTotal;
                    pools[i].allocationSold = pools[i].allocationTotal;
                } else {
                    notFilled = 0;
                    break;
                }
            }
            require(notFilled == 0, "ZPS: Not enough allocation");
            registeredUsers[participant].allocationBoughtAtRound2 = registeredUsers[participant].allocationBoughtAtRound2 + amount;
        } else {
            revert("ZPS: Round not started");
        }

        // Increase amount of sold tokens
        sale.allocationSold = sale.allocationSold + amount;

        sale.token.safeTransferFrom(participant, address(this), amount);
    }

    function _getBeltByStaked(uint256 staked) internal view returns (Belts belt) {
        belt = Belts.COUNT;
        for(uint256 i = 0; i < uint256(Belts.COUNT); i++) {
            if (staked >= pools[i].minStakedZAM) {
                belt = Belts(i);
            } else {
                break;
            }
        }
    }

    function _getAvailablePoolsAtRound2(address participant) internal view returns (uint256 i, uint256 count) {
        count = (uint256(Belts.COUNT) / 2);
        i = uint256(registeredUsers[participant].belt) < count ? 0 : count;
    }

}

