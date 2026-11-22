// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title KibbleVault
/// @notice The owner's safe. Drawers sweep profit here; the agent key has no way to call it.
///         Instant withdrawals only go to `home` (the guardian's address). Any other address
///         waits `delay`, and the owner or `home` can cancel while it waits.
contract KibbleVault {
    using SafeERC20 for IERC20;

    struct Withdrawal {
        address to;
        uint128 amount;
        uint64 readyAt;
        bool done; // executed or cancelled
    }

    IERC20 public immutable token;
    address public immutable owner;
    address public immutable home;
    uint256 public immutable delay;

    Withdrawal[] internal _withdrawals;

    event WithdrawnHome(uint256 amount);
    event WithdrawQueued(uint256 indexed id, address indexed to, uint256 amount, uint256 readyAt);
    event WithdrawExecuted(uint256 indexed id, address indexed to, uint256 amount);
    event WithdrawCancelled(uint256 indexed id, address by);

    error NotOwner();
    error NotOwnerOrHome();
    error ZeroAddress();
    error NotReady();
    error AlreadyDone();
    error UnknownWithdrawal();

    constructor(IERC20 token_, address owner_, address home_, uint256 delay_) {
        if (address(token_) == address(0) || owner_ == address(0) || home_ == address(0)) revert ZeroAddress();
        token = token_;
        owner = owner_;
        home = home_;
        delay = delay_;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @notice Instant, but only to `home`.
    function withdrawHome(uint256 amount) external onlyOwner {
        token.safeTransfer(home, amount);
        emit WithdrawnHome(amount);
    }

    /// @notice Any other destination waits `delay` and can be cancelled by the owner or `home`.
    function queueWithdraw(address to, uint256 amount) external onlyOwner returns (uint256 id) {
        if (to == address(0)) revert ZeroAddress();
        id = _withdrawals.length;
        uint64 readyAt = uint64(block.timestamp + delay);
        _withdrawals.push(Withdrawal({to: to, amount: uint128(amount), readyAt: readyAt, done: false}));
        emit WithdrawQueued(id, to, amount, readyAt);
    }

    function executeWithdraw(uint256 id) external onlyOwner {
        if (id >= _withdrawals.length) revert UnknownWithdrawal();
        Withdrawal storage w = _withdrawals[id];
        if (w.done) revert AlreadyDone();
        if (block.timestamp < w.readyAt) revert NotReady();
        w.done = true;
        token.safeTransfer(w.to, w.amount);
        emit WithdrawExecuted(id, w.to, w.amount);
    }

    function cancelWithdraw(uint256 id) external {
        if (msg.sender != owner && msg.sender != home) revert NotOwnerOrHome();
        if (id >= _withdrawals.length) revert UnknownWithdrawal();
        Withdrawal storage w = _withdrawals[id];
        if (w.done) revert AlreadyDone();
        w.done = true;
        emit WithdrawCancelled(id, msg.sender);
    }

    function withdrawal(uint256 id) external view returns (Withdrawal memory) {
        return _withdrawals[id];
    }

    function withdrawalCount() external view returns (uint256) {
        return _withdrawals.length;
    }

    function balance() external view returns (uint256) {
        return token.balanceOf(address(this));
    }
}
