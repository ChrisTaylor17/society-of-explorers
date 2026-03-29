// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ============================================================
//  SocietyNFT.sol - Society of Explorers Artifact Collection
//
//  ERC-721 Enumerable NFTs with:
//    - On-chain SVG art (no IPFS dependency)
//    - $SOE ERC-20 token payment on mint
//    - Deterministic metadata from token ID
//    - Owner free-mint capability
//    - Withdraw accumulated $SOE
// ============================================================

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/Base64.sol";

contract SocietyNFT is ERC721Enumerable, Ownable {
    using Strings for uint256;

    // -- State -------------------------------------------------
    IERC20  public immutable soeToken;
    uint256 public mintPrice;      // in $SOE (18 decimals)
    uint256 private _nextTokenId;

    struct ArtifactData {
        string  name;
        uint8   artifactType; // 0=Explorer 1=Scholar 2=Thinker 3=Sage
    }
    mapping(uint256 => ArtifactData) private _artifacts;

    // -- Static data -------------------------------------------
    string[8] private ARTIFACT_NAMES = [
        "The Cartographer's Compass",
        "Scroll of First Principles",
        "The Dialectic Lens",
        "Aurelius's Meditations",
        "Einstein's Thought Notebook",
        "Plato's Cave Map",
        "The Stoic's Mirror",
        "The Seeker's Lantern"
    ];

    string[4] private ARTIFACT_TYPES   = ["Explorer", "Scholar", "Thinker", "Sage"];
    string[4] private ARTIFACT_COLORS  = ["#c9a84c", "#8ab0d8", "#7c9e8a", "#c4956a"];
    string[4] private ARTIFACT_SYMBOLS = [unicode"⬡", unicode"◎", unicode"△", unicode"✦"];

    // -- Events ------------------------------------------------
    event ArtifactMinted(address indexed to, uint256 indexed tokenId, string name, uint8 artifactType);

    // -- Constructor -------------------------------------------
    constructor(
        address _soeToken,
        address _initialOwner,
        uint256 _mintPrice
    )
        ERC721("Society of Explorers Artifact", "SOEA")
        Ownable(_initialOwner)
    {
        soeToken  = IERC20(_soeToken);
        mintPrice = _mintPrice;
    }

    // -- Public mint (costs $SOE) ------------------------------
    function mint() external returns (uint256 tokenId) {
        if (mintPrice > 0) {
            bool ok = soeToken.transferFrom(msg.sender, address(this), mintPrice);
            require(ok, "SocietyNFT: SOE transfer failed - approve first");
        }
        tokenId = _mintTo(msg.sender);
    }

    // -- Owner free-mint ---------------------------------------
    function ownerMint(address to) external onlyOwner returns (uint256) {
        return _mintTo(to);
    }

    // -- Internal mint -----------------------------------------
    function _mintTo(address to) internal returns (uint256 tokenId) {
        tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        uint8 aType = uint8(tokenId % 4);
        _artifacts[tokenId] = ArtifactData({
            name:         ARTIFACT_NAMES[tokenId % 8],
            artifactType: aType
        });
        emit ArtifactMinted(to, tokenId, _artifacts[tokenId].name, aType);
    }

    // -- Token URI (fully on-chain) ----------------------------
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        ArtifactData memory art = _artifacts[tokenId];
        string memory color  = ARTIFACT_COLORS[art.artifactType];
        string memory symbol = ARTIFACT_SYMBOLS[art.artifactType];
        string memory typeName = ARTIFACT_TYPES[art.artifactType];

        string memory svg = string(abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">',
            '<defs><radialGradient id="g" cx="50%" cy="45%" r="55%">',
            '<stop offset="0%" stop-color="', color, '" stop-opacity="0.18"/>',
            '<stop offset="100%" stop-color="#0a0800" stop-opacity="1"/></radialGradient></defs>',
            '<rect width="400" height="400" fill="#0a0800"/>',
            '<rect width="400" height="400" fill="url(#g)"/>',
            '<rect x="12" y="12" width="376" height="376" fill="none" stroke="', color, '" stroke-width="0.6" opacity="0.35"/>',
            '<rect x="20" y="20" width="360" height="360" fill="none" stroke="', color, '" stroke-width="0.3" opacity="0.2"/>',
            '<circle cx="200" cy="158" r="72" fill="none" stroke="', color, '" stroke-width="1"/>',
            '<circle cx="200" cy="158" r="52" fill="', color, '" opacity="0.08"/>',
            '<text x="200" y="173" font-family="Georgia,serif" font-size="48" fill="', color, '" text-anchor="middle">', symbol, '</text>',
            '<text x="200" y="270" font-family="Georgia,serif" font-size="15" fill="', color, '" text-anchor="middle" letter-spacing="0.5">', art.name, '</text>',
            '<text x="200" y="296" font-family="Georgia,serif" font-size="9" fill="', color, '" text-anchor="middle" opacity="0.55" letter-spacing="3">SOCIETY OF EXPLORERS</text>',
            '<text x="200" y="356" font-family="Georgia,serif" font-size="9" fill="', color, '" text-anchor="middle" opacity="0.3" letter-spacing="2">',
            typeName, ' \u00b7 #', tokenId.toString(), '</text>',
            '</svg>'
        ));

        string memory imageURI = string(abi.encodePacked(
            "data:image/svg+xml;base64,", Base64.encode(bytes(svg))
        ));

        string memory json = string(abi.encodePacked(
            '{"name":"', art.name,
            '","description":"A rare artifact of the Society of Explorers - minted on Base Sepolia. Held by an Explorer who seeks truth across time.',
            '","image":"', imageURI,
            '","attributes":[',
            '{"trait_type":"Type","value":"', typeName, '"},',
            '{"trait_type":"Token ID","value":', tokenId.toString(), '}',
            ']}'
        ));

        return string(abi.encodePacked(
            "data:application/json;base64,", Base64.encode(bytes(json))
        ));
    }

    // -- Admin -------------------------------------------------
    function setMintPrice(uint256 _price) external onlyOwner {
        mintPrice = _price;
    }

    function withdrawSOE(address to) external onlyOwner {
        uint256 bal = soeToken.balanceOf(address(this));
        require(bal > 0, "SocietyNFT: nothing to withdraw");
        require(soeToken.transfer(to, bal), "SocietyNFT: withdraw failed");
    }
}
