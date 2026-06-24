// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title CeloSaveRegistry
/// @notice Records first-time CeloSave users on-chain. Each address can only
///         register once; the emitted event is the trackable signal for Proof of Ship.
contract CeloSaveRegistry {
    event UserRegistered(address indexed user, uint256 timestamp);

    mapping(address => bool) public isRegistered;

    /// @notice Register the calling wallet. No-ops silently if already registered.
    function register() external {
        if (isRegistered[msg.sender]) return;
        isRegistered[msg.sender] = true;
        emit UserRegistered(msg.sender, block.timestamp);
    }
}
