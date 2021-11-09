pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

contract LacToken is ERC20 {
	/*
   =======================================================================
   ======================== Constructor/Initializer ======================
   =======================================================================
 	*/
	/**
	 * @param  _name - name of the token
	 * @param _symbol - symbol of token
	 * @param _preMintAddress - account address to whoch tokens will be preminted
	 * @param _preMintAmount - indicates the amount of tokens to pre-mint
	 */
	constructor(
		string memory _name,
		string memory _symbol,
		address _preMintAddress,
		uint256 _preMintAmount
	) ERC20(_name, _symbol) {
		require(_preMintAmount > 0, 'LacToken: INVALID_PREMINT_AMOUNT');

		//mint preMint amount of tokens to
		_mint(_preMintAddress, _preMintAmount);
	}
}
