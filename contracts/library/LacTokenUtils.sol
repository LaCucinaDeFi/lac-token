// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

library LacTokenUtils {
	/**
	 * @notice This method allows user to remove the particular number from the numbers list
	 */
	function removeNumberFromList(uint256[] storage _list, uint256 _item) internal {
		uint256 listItems = _list.length;
		require(listItems > 0, 'LacTokenUtils: EMPTY_LIST');

		// check and remove if the last item is item to be removed.
		if (_list[listItems - 1] == _item) {
			_list.pop();
			return;
		}

		(bool isExists, uint256 index) = isNumberExists(_list, _item);
		require(isExists, 'LacTokenUtils: ITEM_DOES_NOT_EXISTS');

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
