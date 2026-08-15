// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Escrow
 * @notice Holds a buyer's USDT (or any configured ERC20) for one listing
 * until the buyer confirms receipt of the manually-transferred game
 * account, then releases 92% to the seller and 8% to the platform.
 *
 * State machine (mirrors backend/routes/escrow.js):
 *   Funded -> TransferInProgress -> Confirmed -> Released
 *                                  \-> Disputed -> resolved by arbiter
 *   TransferInProgress -> auto-releasable to seller after autoReleaseAt
 *   if the buyer never confirms or disputes (anti-fraud: protects sellers
 *   from a buyer who takes the account and goes silent).
 *
 * This contract intentionally does NOT touch game accounts, credentials,
 * or any off-chain system — it only moves the escrowed token.
 */
contract Escrow is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    enum Status { None, Funded, TransferInProgress, Confirmed, Released, Disputed, Refunded }

    struct Trade {
        address buyer;
        address seller;
        uint256 amount;          // total amount buyer deposited
        uint256 commissionBps;   // e.g. 800 = 8.00%
        uint64 autoReleaseAt;    // 0 until seller marks transfer complete
        Status status;
    }

    IERC20 public immutable paymentToken; // e.g. USDT (TRC20/ERC20 bridge or native ERC20 on the deployed chain)
    address public platformWallet;
    address public arbiter;              // resolves disputes (platform admin / multisig)
    uint64 public constant AUTO_RELEASE_WINDOW = 72 hours;

    mapping(bytes32 => Trade) public trades; // key: off-chain listingId hashed, or an incrementing id you choose

    event Deposited(bytes32 indexed tradeId, address indexed buyer, address indexed seller, uint256 amount);
    event TransferMarkedComplete(bytes32 indexed tradeId, uint64 autoReleaseAt);
    event Confirmed(bytes32 indexed tradeId);
    event Released(bytes32 indexed tradeId, uint256 sellerAmount, uint256 commissionAmount);
    event Disputed(bytes32 indexed tradeId, address indexed raisedBy);
    event Resolved(bytes32 indexed tradeId, bool refundedToBuyer);
    event AutoReleased(bytes32 indexed tradeId);

    constructor(address _paymentToken, address _platformWallet, address _arbiter) Ownable(msg.sender) {
        paymentToken = IERC20(_paymentToken);
        platformWallet = _platformWallet;
        arbiter = _arbiter;
    }

    modifier onlyArbiter() {
        require(msg.sender == arbiter, "Not arbiter");
        _;
    }

    /// @notice Buyer deposits funds for a listing. commissionBps is fixed
    /// platform-wide (8% = 800) but passed in so it can be tuned per trade
    /// if promos/discounts are ever introduced.
    function deposit(bytes32 tradeId, address seller, uint256 amount, uint256 commissionBps) external nonReentrant {
        require(trades[tradeId].status == Status.None, "Trade already exists");
        require(amount > 0, "Amount must be > 0");
        require(commissionBps <= 2000, "Commission too high"); // sanity cap at 20%

        paymentToken.safeTransferFrom(msg.sender, address(this), amount);

        trades[tradeId] = Trade({
            buyer: msg.sender,
            seller: seller,
            amount: amount,
            commissionBps: commissionBps,
            autoReleaseAt: 0,
            status: Status.Funded
        });

        emit Deposited(tradeId, msg.sender, seller, amount);
    }

    /// @notice Seller calls this once they've manually transferred the
    /// account (email/password/verification change). Starts the
    /// auto-release countdown.
    function markTransferComplete(bytes32 tradeId) external {
        Trade storage t = trades[tradeId];
        require(t.status == Status.Funded, "Not funded");
        require(msg.sender == t.seller, "Not seller");

        t.status = Status.TransferInProgress;
        t.autoReleaseAt = uint64(block.timestamp) + AUTO_RELEASE_WINDOW;

        emit TransferMarkedComplete(tradeId, t.autoReleaseAt);
    }

    /// @notice Buyer confirms they have working control of the account.
    function confirm(bytes32 tradeId) external {
        Trade storage t = trades[tradeId];
        require(t.status == Status.TransferInProgress, "Not in transfer");
        require(msg.sender == t.buyer, "Not buyer");

        t.status = Status.Confirmed;
        emit Confirmed(tradeId);
    }

    /// @notice Releases funds 92% seller / 8% platform. Callable by
    /// anyone once Confirmed (so either party can trigger the payout tx).
    function release(bytes32 tradeId) external nonReentrant {
        Trade storage t = trades[tradeId];
        require(t.status == Status.Confirmed, "Not confirmed");

        t.status = Status.Released;
        uint256 commission = (t.amount * t.commissionBps) / 10_000;
        uint256 sellerAmount = t.amount - commission;

        paymentToken.safeTransfer(t.seller, sellerAmount);
        paymentToken.safeTransfer(platformWallet, commission);

        emit Released(tradeId, sellerAmount, commission);
    }

    /// @notice Anti-fraud: if the buyer never confirms or disputes within
    /// the window after the seller marked transfer complete, anyone can
    /// trigger the release to the seller. Stops a dishonest buyer from
    /// holding funds hostage indefinitely after taking the account.
    function autoRelease(bytes32 tradeId) external nonReentrant {
        Trade storage t = trades[tradeId];
        require(t.status == Status.TransferInProgress, "Not eligible");
        require(t.autoReleaseAt != 0 && block.timestamp >= t.autoReleaseAt, "Window not elapsed");

        t.status = Status.Released;
        uint256 commission = (t.amount * t.commissionBps) / 10_000;
        uint256 sellerAmount = t.amount - commission;

        paymentToken.safeTransfer(t.seller, sellerAmount);
        paymentToken.safeTransfer(platformWallet, commission);

        emit AutoReleased(tradeId);
        emit Released(tradeId, sellerAmount, commission);
    }

    /// @notice Either party can raise a dispute any time before Released.
    /// Off-chain evidence (screenshots/videos/chat logs) is submitted
    /// through the backend API — the contract only needs to freeze funds.
    function dispute(bytes32 tradeId) external {
        Trade storage t = trades[tradeId];
        require(
            t.status == Status.Funded || t.status == Status.TransferInProgress || t.status == Status.Confirmed,
            "Cannot dispute in this state"
        );
        require(msg.sender == t.buyer || msg.sender == t.seller, "Not a party");

        t.status = Status.Disputed;
        emit Disputed(tradeId, msg.sender);
    }

    /// @notice Arbiter (platform admin/multisig) resolves a dispute after
    /// reviewing the off-chain evidence attached to the dispute record.
    function resolveDispute(bytes32 tradeId, bool refundToBuyer) external onlyArbiter nonReentrant {
        Trade storage t = trades[tradeId];
        require(t.status == Status.Disputed, "Not disputed");

        if (refundToBuyer) {
            t.status = Status.Refunded;
            paymentToken.safeTransfer(t.buyer, t.amount);
            emit Resolved(tradeId, true);
        } else {
            t.status = Status.Released;
            uint256 commission = (t.amount * t.commissionBps) / 10_000;
            uint256 sellerAmount = t.amount - commission;
            paymentToken.safeTransfer(t.seller, sellerAmount);
            paymentToken.safeTransfer(platformWallet, commission);
            emit Resolved(tradeId, false);
            emit Released(tradeId, sellerAmount, commission);
        }
    }

    function setArbiter(address _arbiter) external onlyOwner {
        arbiter = _arbiter;
    }

    function setPlatformWallet(address _platformWallet) external onlyOwner {
        platformWallet = _platformWallet;
    }
}
