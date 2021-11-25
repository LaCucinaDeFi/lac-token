// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

contract LacToken is ERC20, Ownable {
	bool public allowMinting;

	/*
   =======================================================================
   ======================== Constructor/Initializer ======================
   =======================================================================
 	*/
	constructor() ERC20('LAC', 'LaCucina Token') {
		allowMinting = true;
	}

	/**
	 * @notice This method allows admin to mint the LAC tokens to account
	 */
	function mint(address _account, uint256 _amount) external onlyOwner {
		require(allowMinting, 'LacToken: MINTING_DISABLED');
		require(_amount > 0, 'LacToken: INVALID_AMOUNT');

		_mint(_account, _amount);
	}

	/**
	 * @notice This method allows admin to disable the minting of tokens
	 */
	function disableMinting() external onlyOwner {
		require(allowMinting, 'LacToken: ALREADY_DISABLED');
		allowMinting = false;
	}
}
