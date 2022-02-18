// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '@openzeppelin/contracts-upgradeable/utils/introspection/IERC165Upgradeable.sol';
import './IMasterVaultBase.sol';

interface IMasterVault is IERC165Upgradeable, IMasterVaultBase {
	event VaultClaim(
		address indexed logicContract,
		address indexed account,
		uint256 indexed amount,
		uint256 timestamp
	);
	event LogicContractAdded(
		uint256 indexed logicContractId,
		address indexed contractAddress,
		uint256 indexed timeStamp
	);
	event LogicContractDeactivated(
		uint256 indexed logicContractId,
		address indexed contractAddress,
		uint256 indexed timeStamp
	);

	event LogicContractReactivated(
		uint256 indexed logicContractId,
		address indexed contractAddress,
		uint256 indexed timeStamp
	);
  
	event DormantDurationUpdated(uint256 indexed oldDuration, uint256 indexed newDuration);

	function addLogicContract(address _logicContractAddress, string memory _name)
		external
		returns (uint256 logicContractId);

	function deactivateLogicContract(uint256 _logicContractId) external;

	function reactivateLogicContract(uint256 _logicContractId) external;

	function updateDormantDuration(uint256 _newDurationInSeconds) external;

	function dormantDurationInSeconds() external view returns (uint256);

	function isOneOfLogicContract(address _contract) external view returns (bool isLogicContract);
}
