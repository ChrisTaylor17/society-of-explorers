// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ============================================================
//  DeployNFT.s.sol — Deploy SocietyNFT to Base Sepolia
//
//  Usage:
//    forge script script/DeployNFT.s.sol \
//      --rpc-url base_sepolia \
//      --broadcast \
//      --verify \
//      -vvvv
//
//  Required env vars:
//    PRIVATE_KEY          - deployer wallet private key (0x prefix)
//    BASE_SEPOLIA_RPC_URL - https://sepolia.base.org
//    BASESCAN_API_KEY     - for verification (optional)
//    SOE_TOKEN_ADDRESS    - deployed MockSOE address
// ============================================================

import "forge-std/Script.sol";
import "../contracts/SocietyNFT.sol";

contract DeployNFT is Script {
    // 10 $SOE per mint (18 decimals)
    uint256 constant MINT_PRICE = 10 * 1e18;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer           = vm.addr(deployerPrivateKey);
        address soeToken           = vm.envAddress("SOE_TOKEN_ADDRESS");

        console.log("=================================================");
        console.log("  SocietyNFT — Base Sepolia Deployment");
        console.log("=================================================");
        console.log("Deployer  :", deployer);
        console.log("SOE Token :", soeToken);
        console.log("Mint Price: 10 $SOE");

        vm.startBroadcast(deployerPrivateKey);

        SocietyNFT nft = new SocietyNFT(
            soeToken,    // _soeToken
            deployer,    // _initialOwner
            MINT_PRICE   // _mintPrice (10 $SOE)
        );

        console.log("SocietyNFT deployed at:", address(nft));
        console.log("  Name  :", nft.name());
        console.log("  Symbol:", nft.symbol());
        console.log("  Price :", nft.mintPrice());

        vm.stopBroadcast();

        console.log("=================================================");
        console.log("Update lib/contracts.ts:");
        console.log("  SOCIETY_NFT_ADDRESS =", address(nft));
        console.log("=================================================");
    }
}
