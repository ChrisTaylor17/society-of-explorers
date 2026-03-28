// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ============================================================
//  MockSOE.sol — Society of Explorers (SOE)
//  Testnet-only mock $SOE ERC-20 token.
//  DO NOT deploy to mainnet.
// ============================================================

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockSOE is ERC20, Ownable {
    constructor(address initialOwner)
        ERC20("Mock SOE Token", "mSOE")
        Ownable(initialOwner)
    {
        // Mint 1,000,000 mSOE to the deployer for testing
        _mint(initialOwner, 1_000_000 * 10 ** decimals());
    }

    /// @notice Anyone can mint on the testnet faucet-style.
    ///         Remove or gate this in production.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
