// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ============================================================
//  Deploy.s.sol - Society of Explorers one-command deployment
//
//  Deploys to Base Sepolia testnet:
//    1. MockSOE   - testnet $SOE ERC-20 token
//    2. RitualMarketplace - core SOE marketplace contract
//
//  Usage:
//    forge script script/Deploy.s.sol \
//      --rpc-url base_sepolia \
//      --broadcast \
//      --verify \
//      -vvvv
//
//  Required env vars (copy .env.example → .env and fill in):
//    PRIVATE_KEY          - deployer wallet private key (with 0x prefix)
//    BASE_SEPOLIA_RPC_URL - RPC endpoint (default: https://sepolia.base.org)
//    BASESCAN_API_KEY     - for contract verification (optional but recommended)
// ============================================================

import "forge-std/Script.sol";
import "../contracts/MockSOE.sol";
import "../contracts/RitualMarketplace.sol";

contract Deploy is Script {
    // ── Protocol config ──────────────────────────────────────
    //  2% protocol fee (200 basis points)
    uint256 constant PROTOCOL_FEE_BPS = 200;

    // ── Tribekey registry ────────────────────────────────────
    //  Pass address(0) for testnet - the modifier skips the check
    //  when the registry is not configured, so all wallets can test.
    address constant TRIBEKEY_REGISTRY = address(0);

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer           = vm.addr(deployerPrivateKey);

        console.log("=================================================");
        console.log("  Society of Explorers - Base Sepolia Deployment ");
        console.log("=================================================");
        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);

        vm.startBroadcast(deployerPrivateKey);

        // ── Step 1: Deploy MockSOE token ─────────────────────
        MockSOE mockSOE = new MockSOE(deployer);

        console.log("MockSOE deployed at:", address(mockSOE));
        console.log("  Name:    ", mockSOE.name());
        console.log("  Symbol:  ", mockSOE.symbol());
        console.log("  Decimals:", mockSOE.decimals());

        // ── Step 2: Deploy RitualMarketplace ─────────────────
        RitualMarketplace marketplace = new RitualMarketplace(
            address(mockSOE),   // _soeToken
            TRIBEKEY_REGISTRY,  // _tribkeyRegistry (address(0) = disabled for testnet)
            PROTOCOL_FEE_BPS,   // _protocolFeeBps  (2%)
            deployer            // _initialOwner
        );

        console.log("RitualMarketplace deployed at:", address(marketplace));
        console.log("  SOE token:", address(marketplace.soeToken()));
        console.log("  Protocol fee (bps):", marketplace.protocolFeeBps());
        console.log("  Owner:", marketplace.owner());

        vm.stopBroadcast();

        console.log("=================================================");
        console.log("DONE. Update app/lib/contracts.ts:");
        console.log("  RITUAL_MARKETPLACE_ADDRESS =", address(marketplace));
        console.log("  SOE_TOKEN_ADDRESS           =", address(mockSOE));
        console.log("=================================================");
    }
}
