//SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

library LaCucinaUtils {
	/**
	 * @dev Converts a `uint256` to its ASCII `string` decimal representation.
	 */
	function toString(uint256 value) internal pure returns (string memory) {
		// Inspired by OraclizeAPI's implementation - MIT licence
		// https://github.com/oraclize/ethereum-api/blob/b42146b063c7d6ee1358846c198246239e9360e8/oraclizeAPI_0.4.25.sol

		if (value == 0) {
			return '0';
		}
		uint256 temp = value;
		uint256 digits;
		while (temp != 0) {
			digits++;
			temp /= 10;
		}
		bytes memory buffer = new bytes(digits);
		while (value != 0) {
			digits -= 1;
			buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
			value /= 10;
		}
		return string(buffer);
	}

	/**
	 * @notice Concatenate two strings
	 * @param _a the first string
	 * @param _b the second string
	 * @return result the concatenation of `_a` and `_b`
	 */
	function strConcat(string memory _a, string memory _b)
		internal
		pure
		returns (string memory result)
	{
		result = string(abi.encodePacked(bytes(_a), bytes(_b)));
	}

	/**
	 * @notice This method allows admin to except the addresses to have multiple tokens of same NFT.
	 * @param _address indicates the address to add.
	 */
	function addAddressInList(address[] storage _list, address _address) internal {
		require(_address != address(0), 'LaCucinaUtils: CANNOT_EXCEPT_ZERO_ADDRESS');

		(bool isExists, ) = isAddressExists(_list, _address);
		require(!isExists, 'LaCucinaUtils: ADDRESS_ALREADY_EXISTS');

		_list.push(_address);
	}

	/**
	 * @notice This method allows user to remove the particular address from the address list
	 */
	function removeAddressFromList(address[] storage _list, address _item) internal {
		uint256 listItems = _list.length;
		require(listItems > 0, 'LaCucinaUtils: EMPTY_LIST');

		// check and remove if the last item is item to be removed.
		if (_list[listItems - 1] == _item) {
			_list.pop();
			return;
		}

		(bool isExists, uint256 index) = isAddressExists(_list, _item);
		require(isExists, 'LaCucinaUtils: ITEM_DOES_NOT_EXISTS');

		// move supported token to last
		if (listItems > 1) {
			address temp = _list[listItems - 1];
			_list[index] = temp;
		}

		//remove supported token
		_list.pop();
	}

	/**
	 * @notice This method allows to check if particular address exists in list or not
	 * @param _list indicates list of addresses
	 * @param _item indicates address
	 * @return isExists - returns true if item exists otherwise returns false. index - index of the existing item from the list.
	 */
	function isAddressExists(address[] storage _list, address _item)
		internal
		view
		returns (bool isExists, uint256 index)
	{
		for (uint256 i = 0; i < _list.length; i++) {
			if (_list[i] == _item) {
				isExists = true;
				index = i;
				break;
			}
		}
	}

	/**
	 * @notice This method allows user to remove the particular number from the numbers list
	 */
	function removeNumberFromList(uint256[] storage _list, uint256 _item) internal {
		uint256 listItems = _list.length;
		require(listItems > 0, 'LaCucinaUtils: EMPTY_LIST');

		// check and remove if the last item is item to be removed.
		if (_list[listItems - 1] == _item) {
			_list.pop();
			return;
		}

		(bool isExists, uint256 index) = isNumberExists(_list, _item);
		require(isExists, 'LaCucinaUtils: ITEM_DOES_NOT_EXISTS');

		// move supported token to last
		if (listItems > 1) {
			uint256 temp = _list[listItems - 1];
			_list[index] = temp;
		}

		//remove supported token
		_list.pop();
	}

	/**
	 * @notice This method allows to check if particular address exists in list or not
	 * @param _list - indicates list of numbers
	 * @param _item - indicates number
	 * @return isExists - returns true if item exists otherwise returns false. index - index of the existing item from the list.
	 */
	function isNumberExists(uint256[] storage _list, uint256 _item)
		internal
		view
		returns (bool isExists, uint256 index)
	{
		for (uint256 i = 0; i < _list.length; i++) {
			if (_list[i] == _item) {
				isExists = true;
				index = i;
				break;
			}
		}
	}
}
