// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract SocietyNFT is ERC721, Ownable {
    using Strings for uint256;

    IERC20 public soeToken;
    uint256 public mintPrice = 10 * 10**18; // 10 $SOE
    uint256 private _nextTokenId = 1;

    constructor(address _soeToken, address initialOwner)
        ERC721("Society Artifact", "SOEART")
        Ownable(initialOwner)
    {
        soeToken = IERC20(_soeToken);
    }

    function mint() external {
        require(
            soeToken.transferFrom(msg.sender, address(this), mintPrice),
            "SOE transfer failed"
        );
        _safeMint(msg.sender, _nextTokenId);
        _nextTokenId++;
    }

    function tokenURI(uint256 tokenId) public pure override returns (string memory) {
        return string(abi.encodePacked(
            "https://societyofexplorers.com/api/nft/",
            tokenId.toString()
        ));
    }

    function totalMinted() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    function setMintPrice(uint256 _price) external onlyOwner {
        mintPrice = _price;
    }

    function withdrawSOE(address to) external onlyOwner {
        soeToken.transfer(to, soeToken.balanceOf(address(this)));
    }
}
