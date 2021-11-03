// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// MockToken
contract BlockData {
	function getChainId() external view returns (uint256) {
		return block.chainid;
	}

	function getTimestamp() external view returns (uint256) {
		return block.timestamp;
	}
}
