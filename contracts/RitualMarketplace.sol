// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ============================================================
//  RitualMarketplace.sol — Society of Explorers (SOE)
//  Version: 1.0.0
//
//  Purpose:
//    Core micro-payment marketplace for the Society of Explorers
//    network. Members pay $SOE tokens to access AI prompts and
//    run rituals. Smart contract logic is fully on-chain and
//    transparent. Agents (robot-led market participants) can
//    trigger payments autonomously when value is created.
//
//  Key principles:
//    - Data sovereignty: only Tribekey-verified members participate
//    - Privacy: content hashes only — raw data never on-chain
//    - Robot-led free market: registered agents can settle payments
//    - Automatic reward distribution: creators earn on every use
// ============================================================

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

// ─────────────────────────────────────────────────────────────
//  Interface: ITribkeyRegistry
//  Off-chain Tribekey device ownership is verified through this
//  registry. Only wallets paired with a physical Tribekey can
//  list or purchase rituals, preserving human-centric membership.
// ─────────────────────────────────────────────────────────────
interface ITribkeyRegistry {
    /// @notice Returns true if `account` holds a verified Tribekey.
    function isVerified(address account) external view returns (bool);
}

// ─────────────────────────────────────────────────────────────
//  RitualMarketplace
// ─────────────────────────────────────────────────────────────
contract RitualMarketplace is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ── Constants ─────────────────────────────────────────────

    /// @notice Maximum protocol fee: 10% (in basis points, 1 bp = 0.01%).
    uint256 public constant MAX_PROTOCOL_FEE_BPS = 1_000;

    /// @notice Basis-point denominator (100.00%).
    uint256 public constant BPS_DENOMINATOR = 10_000;

    // ── State: token & registry ────────────────────────────────

    /// @notice The $SOE ERC-20 token used for all payments.
    IERC20 public immutable soeToken;

    /// @notice Tribekey registry — gates listing and purchasing.
    ITribkeyRegistry public tribkeyRegistry;

    /// @notice Protocol fee in basis points (default 200 = 2%).
    uint256 public protocolFeeBps;

    /// @notice Accumulated protocol fees available to withdraw.
    uint256 public protocolFeeBalance;

    // ── Structs ────────────────────────────────────────────────

    /**
     * @notice A Ritual is an AI prompt or interactive ceremony
     *         that members can purchase access to.
     *
     * @param creator        The wallet that registered this ritual.
     * @param priceSOE       Cost in $SOE (18-decimal units) per access.
     * @param contentHash    IPFS / encrypted-storage CID of the prompt.
     *                       Raw content is NEVER stored on-chain.
     * @param creatorFeeBps  Share of each payment routed to the creator
     *                       (remaining goes to protocol after fee split).
     * @param totalRevenue   Lifetime $SOE earned by this ritual.
     * @param accessCount    Total number of times this ritual was accessed.
     * @param active         Whether the ritual can currently be purchased.
     * @param requiresTribekey  When true, only Tribekey-verified wallets
     *                          may purchase access.
     */
    struct Ritual {
        address creator;
        uint256 priceSOE;
        bytes32 contentHash;
        uint256 creatorFeeBps;
        uint256 totalRevenue;
        uint256 accessCount;
        bool    active;
        bool    requiresTribekey;
    }

    /**
     * @notice Tracks per-user access records for a given ritual.
     *         Used by the front-end and off-chain agents to verify
     *         that a wallet has paid for access before decrypting.
     */
    struct AccessRecord {
        uint256 accessCount;   // Number of times this user accessed
        uint256 lastAccessAt;  // Block timestamp of most recent access
    }

    // ── State: rituals & access ────────────────────────────────

    /// @notice Auto-incrementing ritual ID counter.
    uint256 public nextRitualId;

    /// @notice ritualId → Ritual definition.
    mapping(uint256 => Ritual) public rituals;

    /// @notice ritualId → user address → AccessRecord.
    mapping(uint256 => mapping(address => AccessRecord)) public accessRecords;

    // ── State: agents (robot-led market) ──────────────────────

    /**
     * @notice Registered autonomous agents that are allowed to trigger
     *         ritual payments on behalf of users.  This enables the
     *         robot-led free market: when an agent creates value for a
     *         member (e.g., completes a task using a prompt), it can
     *         settle the micro-payment atomically without human clicks.
     *
     *         Each agent is authorised by a member for their own account
     *         only — agents cannot touch other members' funds.
     */
    mapping(address => mapping(address => bool)) public agentAuthorised;
    //        member  =>    agent   => isAuthorised

    // ── Events ─────────────────────────────────────────────────

    event RitualListed(
        uint256 indexed ritualId,
        address indexed creator,
        uint256 priceSOE,
        bytes32 contentHash
    );

    event RitualUpdated(
        uint256 indexed ritualId,
        uint256 newPriceSOE,
        bool    active
    );

    event RitualAccessed(
        uint256 indexed ritualId,
        address indexed member,
        address indexed initiator, // member themselves or their agent
        uint256 amountPaid,
        uint256 creatorReward,
        uint256 protocolFee
    );

    event AgentAuthorisationChanged(
        address indexed member,
        address indexed agent,
        bool    authorised
    );

    event ProtocolFeeUpdated(uint256 newFeeBps);

    event ProtocolFeeWithdrawn(address indexed to, uint256 amount);

    event TribkeyRegistryUpdated(address newRegistry);

    // ── Modifiers ─────────────────────────────────────────────

    /**
     * @dev Reverts if `account` does not hold a verified Tribekey,
     *      when the registry address is set.  If the registry has not
     *      been configured yet (zero address), the check is skipped so
     *      the contract can be tested before the registry is deployed.
     */
    modifier onlyTribkeyMember(address account) {
        if (address(tribkeyRegistry) != address(0)) {
            require(
                tribkeyRegistry.isVerified(account),
                "RitualMarketplace: not a Tribekey member"
            );
        }
        _;
    }

    // ── Constructor ────────────────────────────────────────────

    /**
     * @param _soeToken       Address of the deployed $SOE ERC-20 token.
     * @param _tribkeyRegistry Address of the Tribekey registry
     *                         (can be address(0) for initial deployment).
     * @param _protocolFeeBps  Initial protocol fee in basis points.
     * @param _initialOwner    Multisig or DAO address that owns this contract.
     */
    constructor(
        address _soeToken,
        address _tribkeyRegistry,
        uint256 _protocolFeeBps,
        address _initialOwner
    ) Ownable(_initialOwner) {
        require(_soeToken != address(0), "RitualMarketplace: zero token address");
        require(
            _protocolFeeBps <= MAX_PROTOCOL_FEE_BPS,
            "RitualMarketplace: fee exceeds maximum"
        );

        soeToken          = IERC20(_soeToken);
        tribkeyRegistry   = ITribkeyRegistry(_tribkeyRegistry);
        protocolFeeBps    = _protocolFeeBps;
    }

    // ──────────────────────────────────────────────────────────
    //  Section 1: Ritual Management
    // ──────────────────────────────────────────────────────────

    /**
     * @notice List a new ritual (AI prompt or ceremony) on the marketplace.
     *
     * @param priceSOE         Cost per access in $SOE (wei units, 18 dec).
     * @param contentHash      Hash of the encrypted prompt stored off-chain.
     *                         The hash allows members to verify integrity
     *                         without revealing raw content on-chain.
     * @param creatorFeeBps    Creator's share of each payment in basis points.
     *                         Must leave room for the protocol fee — combined
     *                         total must not exceed BPS_DENOMINATOR.
     * @param requiresTribekey Set true to restrict access to verified members.
     * @return ritualId        The ID assigned to the new ritual.
     */
    function listRitual(
        uint256 priceSOE,
        bytes32 contentHash,
        uint256 creatorFeeBps,
        bool    requiresTribekey
    )
        external
        whenNotPaused
        onlyTribkeyMember(msg.sender)
        returns (uint256 ritualId)
    {
        require(priceSOE > 0, "RitualMarketplace: price must be > 0");
        require(contentHash != bytes32(0), "RitualMarketplace: empty content hash");
        require(
            creatorFeeBps + protocolFeeBps <= BPS_DENOMINATOR,
            "RitualMarketplace: combined fees exceed 100%"
        );

        ritualId = nextRitualId++;

        rituals[ritualId] = Ritual({
            creator:          msg.sender,
            priceSOE:         priceSOE,
            contentHash:      contentHash,
            creatorFeeBps:    creatorFeeBps,
            totalRevenue:     0,
            accessCount:      0,
            active:           true,
            requiresTribekey: requiresTribekey
        });

        emit RitualListed(ritualId, msg.sender, priceSOE, contentHash);
    }

    /**
     * @notice Update the price or active status of your own ritual.
     *         Creators retain full sovereignty over their listings.
     *
     * @param ritualId    The ritual to update.
     * @param newPriceSOE New price (0 = keep existing price).
     * @param active      Whether the ritual should accept new purchases.
     */
    function updateRitual(
        uint256 ritualId,
        uint256 newPriceSOE,
        bool    active
    ) external whenNotPaused {
        Ritual storage r = rituals[ritualId];
        require(r.creator == msg.sender, "RitualMarketplace: not the creator");

        if (newPriceSOE > 0) {
            r.priceSOE = newPriceSOE;
        }
        r.active = active;

        emit RitualUpdated(ritualId, r.priceSOE, active);
    }

    // ──────────────────────────────────────────────────────────
    //  Section 2: Access & Micro-Payments
    // ──────────────────────────────────────────────────────────

    /**
     * @notice Purchase access to a ritual.
     *
     *         Payment flow:
     *           1. Full price transferred from `member` to this contract.
     *           2. Creator reward sent immediately to the ritual creator.
     *           3. Protocol fee held in `protocolFeeBalance` for withdrawal.
     *           4. Any residual amount (floating-point dust) stays in contract.
     *
     *         The caller must have approved this contract to spend at least
     *         `rituals[ritualId].priceSOE` $SOE before calling.
     *
     *         Agents may call this on behalf of `member` if the member has
     *         granted authorisation via `setAgentAuthorisation`.
     *
     * @param ritualId  The ritual to access.
     * @param member    The member gaining access (may differ from msg.sender
     *                  when called by an authorised agent).
     */
    function accessRitual(uint256 ritualId, address member)
        external
        nonReentrant
        whenNotPaused
    {
        // ── Caller check ───────────────────────────────────────
        // The caller must be the member themselves, or an agent
        // authorised by the member.
        require(
            msg.sender == member || agentAuthorised[member][msg.sender],
            "RitualMarketplace: caller not member or authorised agent"
        );

        Ritual storage r = rituals[ritualId];

        require(r.active, "RitualMarketplace: ritual not active");
        require(r.creator != address(0), "RitualMarketplace: ritual does not exist");

        // ── Tribekey gate ──────────────────────────────────────
        if (r.requiresTribekey && address(tribkeyRegistry) != address(0)) {
            require(
                tribkeyRegistry.isVerified(member),
                "RitualMarketplace: Tribekey verification required"
            );
        }

        uint256 price = r.priceSOE;

        // ── Pull payment from member ───────────────────────────
        // SafeERC20 handles non-standard tokens gracefully.
        soeToken.safeTransferFrom(member, address(this), price);

        // ── Calculate split ────────────────────────────────────
        uint256 creatorReward = (price * r.creatorFeeBps) / BPS_DENOMINATOR;
        uint256 protocolFee   = (price * protocolFeeBps)  / BPS_DENOMINATOR;
        // Residual (dust from integer division) stays in the contract
        // and accumulates in protocolFeeBalance over time.

        // ── Distribute creator reward immediately ──────────────
        if (creatorReward > 0) {
            soeToken.safeTransfer(r.creator, creatorReward);
        }

        // ── Accumulate protocol fee ────────────────────────────
        protocolFeeBalance += protocolFee;

        // ── Update analytics ───────────────────────────────────
        r.totalRevenue += price;
        r.accessCount  += 1;

        AccessRecord storage record = accessRecords[ritualId][member];
        record.accessCount  += 1;
        record.lastAccessAt  = block.timestamp;

        emit RitualAccessed(
            ritualId,
            member,
            msg.sender,
            price,
            creatorReward,
            protocolFee
        );
    }

    // ──────────────────────────────────────────────────────────
    //  Section 3: Agent Authorisation (Robot-Led Market)
    // ──────────────────────────────────────────────────────────

    /**
     * @notice Grant or revoke an agent's ability to trigger ritual payments
     *         on your behalf.
     *
     *         This powers the robot-led free market: AI agents deployed by
     *         the Society can autonomously settle payments when value is
     *         delivered, without requiring the member to sign each transaction.
     *         Members retain full sovereignty — authorisation is reversible at
     *         any time and scoped only to this member's account.
     *
     * @param agent       The agent wallet address.
     * @param authorised  True to grant, false to revoke.
     */
    function setAgentAuthorisation(address agent, bool authorised) external {
        require(agent != address(0), "RitualMarketplace: zero agent address");
        require(agent != msg.sender,  "RitualMarketplace: cannot authorise self");

        agentAuthorised[msg.sender][agent] = authorised;

        emit AgentAuthorisationChanged(msg.sender, agent, authorised);
    }

    // ──────────────────────────────────────────────────────────
    //  Section 4: Admin & Governance
    // ──────────────────────────────────────────────────────────

    /**
     * @notice Update the Tribekey registry address.
     *         Called when the registry contract is upgraded.
     * @param newRegistry New registry address (address(0) disables the check).
     */
    function setTribkeyRegistry(address newRegistry) external onlyOwner {
        tribkeyRegistry = ITribkeyRegistry(newRegistry);
        emit TribkeyRegistryUpdated(newRegistry);
    }

    /**
     * @notice Update the protocol fee.
     * @param newFeeBps New fee in basis points (max 10%).
     */
    function setProtocolFee(uint256 newFeeBps) external onlyOwner {
        require(
            newFeeBps <= MAX_PROTOCOL_FEE_BPS,
            "RitualMarketplace: fee exceeds maximum"
        );
        protocolFeeBps = newFeeBps;
        emit ProtocolFeeUpdated(newFeeBps);
    }

    /**
     * @notice Withdraw accumulated protocol fees to the DAO treasury.
     * @param to     Recipient address (e.g., multisig or DAO vault).
     * @param amount Amount of $SOE to withdraw.
     */
    function withdrawProtocolFees(address to, uint256 amount)
        external
        onlyOwner
        nonReentrant
    {
        require(to != address(0), "RitualMarketplace: zero recipient");
        require(amount <= protocolFeeBalance, "RitualMarketplace: insufficient fee balance");

        protocolFeeBalance -= amount;
        soeToken.safeTransfer(to, amount);

        emit ProtocolFeeWithdrawn(to, amount);
    }

    /**
     * @notice Pause all purchases and listings in an emergency.
     *         Creator updates and agent authorisations remain unaffected.
     */
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause the marketplace after an emergency is resolved.
    function unpause() external onlyOwner {
        _unpause();
    }

    // ──────────────────────────────────────────────────────────
    //  Section 5: View Helpers
    // ──────────────────────────────────────────────────────────

    /**
     * @notice Check whether a member has ever accessed a specific ritual.
     *         Front-ends use this to gate decryption of the prompt.
     */
    function hasAccess(uint256 ritualId, address member)
        external
        view
        returns (bool)
    {
        return accessRecords[ritualId][member].accessCount > 0;
    }

    /**
     * @notice Return the full Ritual struct for a given ID.
     *         Convenience wrapper so callers don't need to destructure
     *         the public mapping.
     */
    function getRitual(uint256 ritualId)
        external
        view
        returns (Ritual memory)
    {
        return rituals[ritualId];
    }

    /**
     * @notice Return the access record for a member on a specific ritual.
     */
    function getAccessRecord(uint256 ritualId, address member)
        external
        view
        returns (AccessRecord memory)
    {
        return accessRecords[ritualId][member];
    }

    /**
     * @notice Estimate the fee split for a given price at current rates.
     *         Useful for front-ends to display a payment breakdown.
     *
     * @return creatorReward Amount routed to the creator.
     * @return protocolFee   Amount retained by the protocol.
     * @return residual      Dust remaining in the contract.
     */
    function estimateSplit(uint256 ritualId)
        external
        view
        returns (
            uint256 creatorReward,
            uint256 protocolFee,
            uint256 residual
        )
    {
        Ritual memory r = rituals[ritualId];
        creatorReward = (r.priceSOE * r.creatorFeeBps) / BPS_DENOMINATOR;
        protocolFee   = (r.priceSOE * protocolFeeBps)  / BPS_DENOMINATOR;
        residual      = r.priceSOE - creatorReward - protocolFee;
    }
}
