// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {KibbleAdmin} from "../src/KibbleAdmin.sol";
import {KibbleDrawer} from "../src/KibbleDrawer.sol";
import {KibbleFactory} from "../src/KibbleFactory.sol";
import {MockUSD8} from "../src/mocks/MockUSD8.sol";

/// @notice Deploys the shared Kibble contracts: the admin module, the drawer implementation and the
///         factory. Owners then create their vault and drawers through the factory
///         (the agents package's `setup-demo` script does that for the demo).
///   - Aevum testnet and `make fork`: uses the real tUSD8.
///   - `make anvil` (31337) only: deploys MockUSD8 first.
///
///   make deploy-kibble-fork
///   make deploy-kibble-aevum ACCOUNT=<keystore>
contract DeployKibble is Script {
    address constant AEVUM_TUSD8 = 0x456569838f1d43009A91ebA4263147Afd7233483;
    uint256 constant ANVIL_CHAIN = 31337;

    function run() external returns (KibbleFactory factory, address token) {
        vm.startBroadcast();
        if (AEVUM_TUSD8.code.length > 0) {
            token = AEVUM_TUSD8;
        } else {
            require(block.chainid == ANVIL_CHAIN, "tUSD8 not found on this chain. Check the RPC (Aevum testnet is 44005).");
            token = address(new MockUSD8());
        }
        KibbleAdmin adminModule = new KibbleAdmin();
        KibbleDrawer impl = new KibbleDrawer(address(adminModule));
        factory = new KibbleFactory(IERC20(token), address(impl));
        vm.stopBroadcast();

        console.log("chainId      ", block.chainid);
        console.log("token        ", token);
        console.log("adminModule  ", address(adminModule));
        console.log("drawerImpl   ", address(impl));
        console.log("factory      ", address(factory));
        console.log("deployBlock  ", block.number);
    }
}
