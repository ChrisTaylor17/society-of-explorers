// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title SoEMembership — Soulbound ERC-721 Membership NFT
/// @notice Implements EIP-5192 (Minimal Soulbound Interface).
///         Tokens are non-transferable after minting.
interface IERC5192 {
    event Locked(uint256 tokenId);
    event Unlocked(uint256 tokenId);
    function locked(uint256 tokenId) external view returns (bool);
}

contract SoEMembership is ERC721, ERC721Enumerable, Ownable, IERC5192 {
    uint256 private _nextTokenId = 1;
    uint256 public totalMinted;

    // Per-token metadata
    mapping(uint256 => string) private _tokenURIs;
    mapping(uint256 => uint8)  public membershipTier; // 1=Explorer, 2=Seeker, 3=Scholar, 4=Philosopher

    constructor(string memory name_, string memory symbol_)
        ERC721(name_, symbol_)
        Ownable(msg.sender)
    {}

    /// @notice Mint a soulbound membership NFT. Only owner.
    function mint(address to, string memory uri, uint8 tier) external onlyOwner returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _tokenURIs[tokenId] = uri;
        membershipTier[tokenId] = tier;
        totalMinted++;
        emit Locked(tokenId);
        return tokenId;
    }

    // ── Soulbound: block all transfers except minting ────────────
    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721, ERC721Enumerable)
        returns (address)
    {
        address from = _ownerOf(tokenId);
        // Allow minting (from == address(0)) and burning (to == address(0))
        require(from == address(0) || to == address(0), "SoEMembership: soulbound, non-transferable");
        return super._update(to, tokenId, auth);
    }

    // ── EIP-5192 ─────────────────────────────────────────────────
    function locked(uint256 tokenId) external view override returns (bool) {
        _requireOwned(tokenId);
        return true; // always locked
    }

    // ── Token URI ────────────────────────────────────────────────
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _tokenURIs[tokenId];
    }

    // ── Required overrides ───────────────────────────────────────
    function _increaseBalance(address account, uint128 value)
        internal
        override(ERC721, ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable)
        returns (bool)
    {
        // IERC5192 interface id = 0xb45a3c0e
        return interfaceId == 0xb45a3c0e || super.supportsInterface(interfaceId);
    }
}
