// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title SoEAchievements — Soulbound ERC-1155 Achievement NFTs
contract SoEAchievements is ERC1155, Ownable {
    // Achievement token IDs
    uint256 public constant RITUAL_COMPLETION      = 1;
    uint256 public constant HALL_ARTIFACT           = 2;
    uint256 public constant SALON_HOST              = 3;
    uint256 public constant THINKER_STREAK_30       = 4;
    uint256 public constant SALON_CITY_SUPPORTER    = 5;
    uint256 public constant MUSIC_THERAPY_HARDWARE  = 6;
    uint256 public constant PROJECT_BACKER          = 7;

    constructor(string memory uri_) ERC1155(uri_) Ownable(msg.sender) {}

    /// @notice Mint achievement NFT. Only owner.
    function mint(address to, uint256 tokenId, uint256 amount) external onlyOwner {
        _mint(to, tokenId, amount, "");
    }

    /// @notice Batch mint. Only owner.
    function mintBatch(address to, uint256[] memory ids, uint256[] memory amounts) external onlyOwner {
        _mintBatch(to, ids, amounts, "");
    }

    // ── Soulbound: block transfers (allow mint and burn only) ────
    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal
        override
    {
        require(from == address(0) || to == address(0), "SoEAchievements: soulbound, non-transferable");
        super._update(from, to, ids, values);
    }
}
