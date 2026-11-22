// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {KibbleDrawer} from "./KibbleDrawer.sol";
import {KibbleVault} from "./KibbleVault.sol";
import {Mode, Config, SupplierInit, AcceptorInit, Init} from "./KibbleTypes.sol";

/// @title KibbleFactory
/// @notice Deploys one vault per owner and one drawer (a minimal clone) per agent. The drawer address is
///         the agent's `payTo`: buyers pay it, and it pays suppliers.
contract KibbleFactory {
    IERC20 public immutable token;
    address public immutable drawerImpl;

    mapping(address owner => address vault) public vaultOf;
    address[] public drawers;

    event VaultCreated(address indexed owner, address vault, address home, uint256 delay);
    event DrawerCreated(
        address indexed owner, address indexed agent, address drawer, address vault, Mode mode, string label
    );

    error VaultExists();
    error NoVault();

    constructor(IERC20 token_, address drawerImpl_) {
        token = token_;
        drawerImpl = drawerImpl_;
    }

    /// @notice One vault per owner. `home` is the guardian: the only instant withdrawal address.
    function createVault(address home, uint256 withdrawDelay) external returns (address vault) {
        if (vaultOf[msg.sender] != address(0)) revert VaultExists();
        vault = address(new KibbleVault(token, msg.sender, home, withdrawDelay));
        vaultOf[msg.sender] = vault;
        emit VaultCreated(msg.sender, vault, home, withdrawDelay);
    }

    /// @notice New drawer for `agent`. The caller is the owner; the guardian is the vault's `home`.
    function createDrawer(
        Mode mode,
        address agent,
        Config calldata cfg,
        SupplierInit[] calldata suppliers,
        AcceptorInit[] calldata acceptors,
        string calldata label
    ) external returns (address drawer) {
        address vault = vaultOf[msg.sender];
        if (vault == address(0)) revert NoVault();
        drawer = Clones.clone(drawerImpl);
        KibbleDrawer(drawer).initialize(
            Init({
                token: token,
                mode: mode,
                owner: msg.sender,
                guardian: KibbleVault(vault).home(),
                agent: agent,
                vault: vault,
                cfg: cfg,
                suppliers: suppliers,
                acceptors: acceptors
            })
        );
        drawers.push(drawer);
        emit DrawerCreated(msg.sender, agent, drawer, vault, mode, label);
    }

    function drawerCount() external view returns (uint256) {
        return drawers.length;
    }

    /// @notice Production defaults. The owner only picks `maxWeeklyLoss`; everything else is derived or
    ///         calibrated during the learning windows.
    function defaultConfig(uint256 maxWeeklyLoss) external pure returns (Config memory c) {
        c.maxWeeklyLoss = maxWeeklyLoss;
        c.tMin = maxWeeklyLoss / 40;
        c.maxStep = 1e6;
        c.minActivity = 3e6;
        c.slack = 0.1e6;
        c.unknownBudget = 1e6;
        c.windowLength = 1 days;
        c.incomeHold = 1 days;
        c.strikeCooldown = 10 minutes;
        c.delay = 1 days;
        c.drawdownPeriod = 7 days;
        c.learningWindows = 7;
        c.growthBps = 1_000;
        c.carryBps = 5_000;
    }

    /// @notice Demo timings (report section 10): 20 s windows, 10 s hold, 2 min loosening delay.
    function demoConfig(uint256 maxWeeklyLoss) external pure returns (Config memory c) {
        c.maxWeeklyLoss = maxWeeklyLoss;
        c.tMin = 1e6;
        c.maxStep = 1e6;
        c.minActivity = 0.5e6;
        c.slack = 0.05e6;
        c.unknownBudget = 1e6;
        c.windowLength = 20;
        c.incomeHold = 10;
        c.strikeCooldown = 5;
        c.delay = 2 minutes;
        c.drawdownPeriod = 7 days;
        c.learningWindows = 5;
        c.growthBps = 1_000;
        c.carryBps = 5_000;
    }
}
