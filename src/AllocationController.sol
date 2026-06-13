// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {VaultFactory} from "./VaultFactory.sol";
import {StrategyVault} from "./StrategyVault.sol";
import {IValidationRegistry} from "./interfaces/IValidationRegistry.sol";

/// @title AllocationController — capital routes to proven agents
/// @notice A pooled USD index. Depositors get index shares; `allocate` routes idle pool USD
///         into OFFICIAL vaults, weighted by each agent's ERC-8004 validation score. Only
///         vaults from the trusted VaultFactory are ever considered, and only agents with a
///         minimum on-chain track record (settled epochs) and a passing score are eligible —
///         so a single lucky epoch or a fake self-reported score can't attract capital.
///
/// @dev Trust + anti-gaming controls (the consumer-side rules our audits required):
///      - official-vault filter: `factory.isOfficialVault(v)` must be true.
///      - score is read from the ValidationRegistry **filtered to that one vault** as the
///        validator, so self-reported/rogue scores are structurally excluded.
///      - `minEpochs` track-record gate + `minScore` quality gate.
///      Candidate vault lists are caller-supplied and must be strictly ascending (bounds gas
///      and guarantees uniqueness), so the unbounded official-vault set can't gas-brick us.
contract AllocationController is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable usd;
    VaultFactory public immutable factory;
    IValidationRegistry public immutable validation;
    uint8 public immutable minScore; // e.g. 50 (breakeven) — minimum avg score to receive capital
    uint64 public immutable minEpochs; // e.g. 1 — minimum settled epochs (track record)

    // Index-share accounting (donation-proof: NAV uses internal idle + vault.totalAssets).
    mapping(address => uint256) public shares;
    uint256 public totalShares;
    uint256 public idleUSD; // accounted, undeployed USD

    // Deployed positions: index controller's shares in each vault it allocated to.
    mapping(address => uint256) public controllerShares; // vault => vault-shares held
    mapping(address => bool) public isDeployed;
    address[] public deployedVaults;
    mapping(address => uint256) private _vaultIndexPlus1; // vault => (index in deployedVaults)+1

    event Deposited(address indexed user, uint256 usdIn, uint256 sharesOut);
    event Withdrawn(address indexed user, uint256 sharesIn, uint256 usdOut);
    event Allocated(address indexed vault, uint256 usdIn, uint256 vaultShares);
    event Recalled(address indexed vault, uint256 usdOut);

    error ZeroAmount();
    error ZeroAddress();
    error InsufficientShares();
    error InsufficientIdle(uint256 needed, uint256 available);
    error ExceedsIdle(uint256 amount, uint256 available);
    error NoEligibleVaults();
    error NotAscending(); // candidate list must be strictly ascending (unique + bounded)
    error RenounceDisabled();

    constructor(
        address usd_,
        address factory_,
        address validation_,
        uint8 minScore_,
        uint64 minEpochs_
    ) Ownable(msg.sender) {
        if (usd_ == address(0) || factory_ == address(0) || validation_ == address(0)) revert ZeroAddress();
        usd = IERC20(usd_);
        factory = VaultFactory(factory_);
        validation = IValidationRegistry(validation_);
        minScore = minScore_;
        minEpochs = minEpochs_;
    }

    // --------------------------- Pool in / out ---------------------------- //

    /// @notice Deposit USD into the index and receive shares.
    function deposit(uint256 amount) external nonReentrant returns (uint256 mintedShares) {
        if (amount == 0) revert ZeroAmount();
        uint256 nav = totalNAV();
        mintedShares = (totalShares == 0 || nav == 0) ? amount : (amount * totalShares) / nav;
        if (mintedShares == 0) revert ZeroAmount();

        totalShares += mintedShares;
        shares[msg.sender] += mintedShares;
        idleUSD += amount;

        usd.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount, mintedShares);
    }

    /// @notice Burn index shares and withdraw USD pro-rata of NAV. Pays from idle USD; if idle
    ///         is short, call `recall` first to pull capital back from between-epoch vaults.
    function withdraw(uint256 shareAmount) external nonReentrant returns (uint256 usdOut) {
        if (shareAmount == 0) revert ZeroAmount();
        uint256 userShares = shares[msg.sender];
        if (userShares < shareAmount) revert InsufficientShares();

        usdOut = (shareAmount * totalNAV()) / totalShares;
        if (idleUSD < usdOut) revert InsufficientIdle(usdOut, idleUSD);

        shares[msg.sender] = userShares - shareAmount;
        totalShares -= shareAmount;
        idleUSD -= usdOut;

        usd.safeTransfer(msg.sender, usdOut);
        emit Withdrawn(msg.sender, shareAmount, usdOut);
    }

    // --------------------------- Allocation ------------------------------- //

    /// @notice Deploy `amountToDeploy` of idle USD across eligible official vaults, weighted by
    ///         validation score. `candidates` must be strictly ascending official-vault
    ///         addresses (unique + bounded). Ineligible candidates are skipped.
    function allocate(address[] calldata candidates, uint256 amountToDeploy)
        external
        nonReentrant
        onlyOwner
    {
        if (amountToDeploy == 0) revert ZeroAmount();
        if (amountToDeploy > idleUSD) revert ExceedsIdle(amountToDeploy, idleUSD);

        uint256 n = candidates.length;
        uint256[] memory weights = new uint256[](n);
        uint256 sumWeight;
        address prev;
        for (uint256 i = 0; i < n; i++) {
            address v = candidates[i];
            if (v <= prev) revert NotAscending();
            prev = v;
            uint256 w = _eligibleWeight(v);
            weights[i] = w;
            sumWeight += w;
        }
        if (sumWeight == 0) revert NoEligibleVaults();

        uint256 deployed;
        for (uint256 i = 0; i < n; i++) {
            if (weights[i] == 0) continue;
            uint256 portion = (amountToDeploy * weights[i]) / sumWeight;
            if (portion == 0) continue;
            _deployTo(candidates[i], portion);
            deployed += portion;
        }
        idleUSD -= deployed; // any rounding remainder stays idle
    }

    /// @notice Pull all of the controller's capital back from the given vaults into idle USD.
    ///         Only vaults that are between epochs (not active) can be recalled.
    function recall(address[] calldata vaults) external nonReentrant {
        uint256 recalled;
        for (uint256 i = 0; i < vaults.length; i++) {
            address v = vaults[i];
            uint256 vShares = controllerShares[v];
            if (vShares == 0) continue;
            if (StrategyVault(v).epochActive()) continue; // can't withdraw mid-epoch
            controllerShares[v] = 0;
            uint256 out = StrategyVault(v).withdraw(vShares);
            recalled += out;
            _removeDeployed(v); // prune fully-recalled vault so totalNAV stays bounded
            emit Recalled(v, out);
        }
        idleUSD += recalled;
    }

    // -------------------------------- Views ------------------------------- //

    /// @notice Total net asset value of the pool = idle USD + value of all deployed positions.
    /// @dev Uses each vault's donation-proof `totalAssets`, so the index NAV is also donation-proof.
    function totalNAV() public view returns (uint256 nav) {
        nav = idleUSD;
        uint256 len = deployedVaults.length;
        for (uint256 i = 0; i < len; i++) {
            address v = deployedVaults[i];
            uint256 cs = controllerShares[v];
            if (cs == 0) continue;
            uint256 ts = StrategyVault(v).totalShares();
            if (ts == 0) continue;
            nav += (StrategyVault(v).totalAssets() * cs) / ts;
        }
    }

    /// @notice The score-weight a vault would receive right now (0 if ineligible). For UIs.
    function eligibleWeight(address vault) external view returns (uint256) {
        return _eligibleWeight(vault);
    }

    function deployedVaultCount() external view returns (uint256) {
        return deployedVaults.length;
    }

    // ------------------------------- Internal ----------------------------- //

    /// @dev Returns the allocation weight (= avg validation score) for a vault, or 0 if it is
    ///      not official, is mid-epoch, lacks the minimum track record, or scores below minScore.
    function _eligibleWeight(address vault) internal view returns (uint256) {
        if (!factory.isOfficialVault(vault)) return 0;
        if (StrategyVault(vault).epochActive()) return 0; // can't deposit mid-epoch

        uint256 agentId = StrategyVault(vault).agentId();
        address[] memory validators = new address[](1);
        validators[0] = vault; // official-vault filter: only THIS vault's self-validations count
        (uint64 count, uint8 avg) = validation.getSummary(agentId, validators, "");
        if (count < minEpochs) return 0; // track-record gate
        if (avg < minScore) return 0; // quality gate
        return uint256(avg);
    }

    function _deployTo(address vault, uint256 amount) internal {
        usd.forceApprove(vault, amount);
        uint256 vShares = StrategyVault(vault).deposit(amount);
        usd.forceApprove(vault, 0);
        controllerShares[vault] += vShares;
        if (!isDeployed[vault]) {
            isDeployed[vault] = true;
            deployedVaults.push(vault);
            _vaultIndexPlus1[vault] = deployedVaults.length; // index + 1
        }
        emit Allocated(vault, amount, vShares);
    }

    /// @dev Remove a fully-recalled vault from `deployedVaults` (swap-and-pop) so the array —
    ///      and therefore `totalNAV`'s loop — stays bounded to currently-deployed positions.
    function _removeDeployed(address vault) internal {
        uint256 idxPlus1 = _vaultIndexPlus1[vault];
        if (idxPlus1 == 0) return;
        uint256 idx = idxPlus1 - 1;
        uint256 lastIdx = deployedVaults.length - 1;
        if (idx != lastIdx) {
            address last = deployedVaults[lastIdx];
            deployedVaults[idx] = last;
            _vaultIndexPlus1[last] = idx + 1;
        }
        deployedVaults.pop();
        _vaultIndexPlus1[vault] = 0;
        isDeployed[vault] = false;
    }

    /// @notice Disabled: renouncing ownership would permanently freeze `allocate`. Use
    ///         `transferOwnership` instead. (`recall`/`withdraw` stay permissionless regardless.)
    function renounceOwnership() public view override onlyOwner {
        revert RenounceDisabled();
    }
}
