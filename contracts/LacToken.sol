// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

contract LacToken is ERC20, AccessControl {
	bool public allowMinting;

	/*
   =======================================================================
   ======================== Constructor/Initializer ======================
   =======================================================================
 	*/
	constructor() ERC20('LAC', 'LaCucina Token') {
		_setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
		allowMinting = true;
	}

	modifier onlyAdmin() {
		require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), 'LacToken: ONLY_ADMIN_CAN_CALL');
		_;
	}

	/**
	 * @notice This method allows admin to mint the LAC tokens to account
	 */
	function mint(address _account, uint256 _amount) external onlyAdmin {
		require(allowMinting, 'LacToken: MINTING_DISABLED');
		require(_amount > 0, 'LacToken: INVALID_AMOUNT');

		_mint(_account, _amount);
	}

	/**
	 * @notice This method allows admin to disable the minting of tokens
	 */
	function disableMinting() external onlyAdmin {
		require(allowMinting, 'LacToken: ALREADY_DISABLED');
		allowMinting = false;
	}
}
