// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/access/Ownable.sol';

// File: contracts/SampleToken.sol

contract SampleToken is ERC20('Sample Token ', 'SAMPLE'), Ownable {
	function mint(address _to, uint256 _amount) public onlyOwner {
		_mint(_to, _amount);
	}
}
