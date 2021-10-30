pragma solidity ^0.8.0;

import '@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';

contract LacToken is ERC20Upgradeable, AccessControlUpgradeable, ReentrancyGuardUpgradeable {
	/*
   	=======================================================================
   	======================== Constructor/Initializer ======================
   	=======================================================================
 	*/

	/**
	 * @notice Used in place of the constructor to allow the contract to be upgradable via proxy.
	 */
	function initialize(
		string memory _name,
		string memory _symbol,
		address _preMintAddress,
		uint256 _preMintAmount
	) external virtual initializer {
		require(_preMintAmount > 0, 'LacToken: INVALID_PREMINT_AMOUNT');

		__AccessControl_init();
		__ReentrancyGuard_init();
		__ERC20_init(_name, _symbol);

		_setupRole(DEFAULT_ADMIN_ROLE, _msgSender());

		//mint preMint amount of tokens to
		_mint(_preMintAddress, _preMintAmount);
	}
}
