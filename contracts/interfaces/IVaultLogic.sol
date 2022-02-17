// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import '@openzeppelin/contracts/utils/introspection/IERC165.sol';
import './ILogicBase.sol';

interface IVaultLogic is IERC165, ILogicBase {
	event Claimed(
		address account,
		uint256 receiverId,
		uint256 amount,
		uint256 timestamp,
		uint256 referenceId
	);

	function setup(string[] memory _fundReceivers, uint256[] memory _shares) external;

	function claim(
		uint256 _amount,
		uint256 _receiverId,
		uint256 _referenceNumber,
		bytes calldata _signature
	) external;
}
