// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IMasterVaultBase {
	function claim(
		address _account,
		address _tokenAddress,
		uint256 _amount
	) external returns (bool);
}
