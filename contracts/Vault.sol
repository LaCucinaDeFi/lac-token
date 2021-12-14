// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/cryptography/draft-EIP712Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol';

import './library/LacTokenUtils.sol';
import './interfaces/IVersionedContract.sol';

contract Vault is
	EIP712Upgradeable,
	AccessControlUpgradeable,
	ReentrancyGuardUpgradeable,
	IVersionedContract
{
	/*
   =======================================================================
   ======================== Structures ===================================
   =======================================================================
 */

	struct FundReceiver {
		uint256 lacShare;
		uint256 totalAccumulatedFunds;
	}
	/*
   =======================================================================
   ======================== Constants ====================================
   =======================================================================
 */

	bytes32 public constant VAULT_KEEPER = keccak256('VAULT_KEEPER');

	/*
   =======================================================================
   ======================== Public Variables ============================
   =======================================================================
 */

	IERC20Upgradeable public LacToken;

	uint256 public totalShares;
	uint256 public startBlock;
	uint256 public currentReleaseRatePerPeriod;
	uint256 public currentReleaseRatePerBlock;
	uint256 public finalReleaseRatePerPeriod;
	int256 public changePercentage;
	uint256 public changeRateAfterPeriod;
	uint256 public lastFundUpdatedBlock;
	uint256 public totalBlocksPerPeriod;
	uint256 public shareMultiplier;
	address[] public fundReceiversList;
	bool public isSetup;

	/// fundReceiver => share percentage
	mapping(address => FundReceiver) public fundReceivers;

	/// userAddress => nonce
	mapping(address => uint256) public userNonce;

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
		address _lacAddress,
		uint256 _initialReleaseRatePerPeriod,
		uint256 _finalReleaseRatePerPeriod,
		int256 _changePercentage,
		uint256 _changeRateAfterPeriod,
		uint256 _totalBlocksPerPeriod
	) external virtual initializer {
		require(_lacAddress != address(0), 'Vault: INVALID_LAC_ADDRESS');
		__AccessControl_init();
		__ReentrancyGuard_init();
		__EIP712_init(_name, getVersionNumber());
		_setupRole(DEFAULT_ADMIN_ROLE, _msgSender());

		LacToken = IERC20Upgradeable(_lacAddress);
		shareMultiplier = 1e12;

		currentReleaseRatePerPeriod = _initialReleaseRatePerPeriod;

		// calculate per block release rate ex. currentReleaseRatePerPeriod / _totalBlocksPerPeriod.
		currentReleaseRatePerBlock = currentReleaseRatePerPeriod / _totalBlocksPerPeriod;

		finalReleaseRatePerPeriod = _finalReleaseRatePerPeriod;
		changePercentage = _changePercentage;
		changeRateAfterPeriod = _changeRateAfterPeriod;
		totalBlocksPerPeriod = _totalBlocksPerPeriod;
	}

	/*
   =======================================================================
   ======================== Events ====================================
   =======================================================================
 	*/
	event Claimed(
		address account,
		address receiver,
		uint256 amount,
		uint256 timestamp,
		uint256 referenceId
	);

	event ReceiverAdded(address receiver, uint256 share);
	event ReceiverRemoved(address receiver);
	event ReceiverShareUpdated(address receiver, uint256 newShare);
	event ReceiverShrinked(address existingReceiver, address newReceiver, uint256 newShare);
	event finalReleaseRatePerPeriodUpdated(uint256 newPerPeriodRate);
	event ChangePercentage(int256 newPercent);
	event ChangeRateAfterPeriod(uint256 newRate);
	event UpdateTotalBlocksPerPeriod(uint256 newTotalBlocksPerPeriod);
	event ClaimTokens(address user, address tokenAddress, uint256 amount);
	/*
   =======================================================================
   ======================== Modifiers ====================================
   =======================================================================
 	*/

	modifier onlyAdmin() {
		require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), 'Vault: ONLY_ADMIN_CAN_CALL');
		_;
	}

	/*
   =======================================================================
   ======================== Public Methods ===============================
   =======================================================================
 	*/
	/**
	 * @notice This method allows admin to setup the startblock and lastfund updated block and adds the initial receivers
	 * @param _fundReceivers - indicates the list of receivers
	 * @param _shares - indicates the list of shares of respective receivers
	 */
	function setup(address[] memory _fundReceivers, uint256[] memory _shares) external onlyAdmin {
		require(!isSetup, 'Vault: ALREADY_SETUP_DONE');
		require(
			_fundReceivers.length > 0 && _fundReceivers.length == _shares.length,
			'Vault: INVALID_DATA'
		);

		for (uint256 i = 0; i < _fundReceivers.length; i++) {
			_addFundReceiverAddress(_fundReceivers[i], _shares[i]);
		}

		lastFundUpdatedBlock = block.number;
		startBlock = block.number;
		isSetup = true;
	}

	/**
	 * @notice This method allows operators to claim the specified amount of LAC tokens from the fundReceiver
	 * @param  _amount - indicates the amount of tokens to claim
	 * @param _receiver - indicates the fund receiver address from which funds to claim
	 * @param _referenceNumber - indicates the unique reference number for claim
	 * @param _signature - indicates the singature for claiming the tokens
	 */
	function claim(
		uint256 _amount,
		address _receiver,
		uint256 _referenceNumber,
		bytes calldata _signature
	) external virtual nonReentrant {
		(bool isExists, ) = LacTokenUtils.isAddressExists(fundReceiversList, _receiver);
		require(isExists, 'Vault: RECEIVER_DOES_NOT_EXISTS');

		// update allocated funds
		_updateAllocatedFunds();

		require(
			_amount > 0 && _amount <= fundReceivers[_receiver].totalAccumulatedFunds,
			'Vault: INSUFFICIENT_AMOUNT'
		);
		require(
			_verify(_hash(_amount, _receiver, userNonce[msg.sender], _referenceNumber), _signature),
			'Vault: INVALID_SIGNATURE'
		);

		require(LacToken.transfer(msg.sender, _amount), 'Vault: TRANSFER_FAILED');

		fundReceivers[_receiver].totalAccumulatedFunds -= _amount;

		//update user nonce
		userNonce[msg.sender] += 1;

		emit Claimed(msg.sender, _receiver, _amount, block.timestamp, _referenceNumber);
	}

	/**
	 * @notice This method allows admin to adds the receivers
	 * @param _fundReceivers - indicates the list of receivers
	 * @param _shares - indicates the list of shares of respective receivers
	 */
	function addFundReceivers(address[] memory _fundReceivers, uint256[] memory _shares)
		external
		virtual
		onlyAdmin
	{
		require(
			_fundReceivers.length > 0 && _fundReceivers.length == _shares.length,
			'Vault: INVALID_DATA'
		);

		_updateAllocatedFunds();

		for (uint256 i = 0; i < _fundReceivers.length; i++) {
			_addFundReceiverAddress(_fundReceivers[i], _shares[i]);
		}
	}

	/**
	 * @notice This method allows admin to remove the allocator address from being able to claim/receive LAC tokens.
	 * @param _account indicates the address to remove.
	 */
	function removeFundReceiverAddress(address _account) external virtual onlyAdmin {
		_updateAllocatedFunds();

		LacTokenUtils.removeAddressFromList(fundReceiversList, _account);

		// update total shares
		totalShares -= fundReceivers[_account].lacShare;

		delete fundReceivers[_account];

		emit ReceiverRemoved(_account);
	}

	/**
	 * @notice This method allows admin to update the receiver`s share
	 * @param _receiver - indicates the address of the fundReceiver
	 * @param _newShare - indicates the new share for the fundReceiver. ex. 100 = 1%
	 */
	function updateReceiverShare(address _receiver, uint256 _newShare) external virtual onlyAdmin {
		_updateAllocatedFunds();

		(bool isExists, ) = LacTokenUtils.isAddressExists(fundReceiversList, _receiver);

		require(isExists, 'Vault: RECEIVER_DOES_NOT_EXISTS');
		uint256 currentShare = fundReceivers[_receiver].lacShare;

		require(currentShare != _newShare && _newShare > 0, 'Vault: INVALID_SHARE');

		totalShares = (totalShares - fundReceivers[_receiver].lacShare) + _newShare;
		fundReceivers[_receiver].lacShare = _newShare;

		emit ReceiverShareUpdated(_receiver, _newShare);
	}

	/**
	 * @notice This method allows admin to add new receiver by shrinking the share of existing receiver.
	 * @param _existingReceiver - indicates the address of the existing fundReceiver whose share will allocated to new receiver
	 * @param _newReceiver - indicates the address of the new fundReceiver.
	 * @param _newShare - indicates the new share for the fundReceiver. ex. 100 = 1%
	 */
	function shrinkReceiver(
		address _existingReceiver,
		address _newReceiver,
		uint256 _newShare
	) external virtual onlyAdmin {
		_updateAllocatedFunds();
		(bool isReceiverExists, ) = LacTokenUtils.isAddressExists(fundReceiversList, _existingReceiver);
		require(isReceiverExists, 'Vault: RECEIVER_DOES_NOT_EXISTS');

		uint256 currentShare = fundReceivers[_existingReceiver].lacShare;
		require(_newShare < currentShare && _newShare > 0, 'Vault: INVALID_SHARE');
		LacTokenUtils.addAddressInList(fundReceiversList, _newReceiver);

		fundReceivers[_existingReceiver].lacShare = currentShare - _newShare;
		fundReceivers[_newReceiver].lacShare = _newShare;

		emit ReceiverShrinked(_existingReceiver, _newReceiver, _newShare);
	}

	function updateFinalReleaseRatePerPeriod(uint256 _maxReleaseRate) external virtual onlyAdmin {
		require(_maxReleaseRate != finalReleaseRatePerPeriod, 'Vault: ALREADY_SET');
		finalReleaseRatePerPeriod = _maxReleaseRate;

		emit finalReleaseRatePerPeriodUpdated(_maxReleaseRate);
	}

	function updateChangePercentage(int256 _newPercentage) external virtual onlyAdmin {
		require(_newPercentage != changePercentage, 'Vault: ALREADY_SET');
		changePercentage = _newPercentage;
		emit ChangePercentage(_newPercentage);
	}

	function updateChangeRateAfterPeriod(uint256 _newPeriods) external virtual onlyAdmin {
		require(_newPeriods != changeRateAfterPeriod, 'Vault: ALREADY_SET');
		changeRateAfterPeriod = _newPeriods;

		emit ChangeRateAfterPeriod(_newPeriods);
	}

	function updateTotalBlocksPerPeriod(uint256 _newBlocks) external virtual onlyAdmin {
		require(_newBlocks != totalBlocksPerPeriod, 'Vault: ALREADY_SET');
		totalBlocksPerPeriod = _newBlocks;
		emit UpdateTotalBlocksPerPeriod(_newBlocks);
	}

	/**
	 * @notice This method allows admin to claim all the tokens of specified address to given address
	 */
	function claimAllTokens(address _user, address _tokenAddress) external onlyAdmin {
		require(_user != address(0), 'Vault: INVALID_USER_ADDRESS');
		require(
			_tokenAddress != address(0) && _tokenAddress != address(LacToken),
			'Vault: INVALID_TOKEN_ADDRESS'
		);

		uint256 tokenAmount = IERC20Upgradeable(_tokenAddress).balanceOf(address(this));

		require(IERC20Upgradeable(_tokenAddress).transfer(_user, tokenAmount));

		emit ClaimTokens(_user, _tokenAddress, tokenAmount);
	}

	/**
	 * @notice This method allows admin to transfer specified amount of the tokens of specified address to given address
	 */
	function claimTokens(
		address _user,
		address _tokenAddress,
		uint256 _amount
	) external onlyAdmin {
		require(_user != address(0), 'Vault: INVALID_USER_ADDRESS');
		require(
			_tokenAddress != address(0) && _tokenAddress != address(LacToken),
			'Vault: INVALID_TOKEN_ADDRESS'
		);

		uint256 tokenAmount = IERC20Upgradeable(_tokenAddress).balanceOf(address(this));
		require(_amount > 0 && tokenAmount >= _amount, 'Vault: INSUFFICIENT_BALANCE');

		require(IERC20Upgradeable(_tokenAddress).transfer(_user, _amount));

		emit ClaimTokens(_user, _tokenAddress, _amount);
	}

	/*
   =======================================================================
   ======================== Getter Methods ===============================
   =======================================================================
 	*/
	/**
	 * This method returns the total number of fundReceivers available in vault
	 */
	function getTotalFundReceivers() external view virtual returns (uint256) {
		return fundReceiversList.length;
	}

	/**
	 * This method returns the share of specified fund receiver
	 */
	function getFundReceiverShare(address _receiver) public view virtual returns (uint256) {
		return (fundReceivers[_receiver].lacShare * shareMultiplier) / totalShares;
	}

	/**
	 * This method returns fundReceiver`s accumulated funds
	 */
	function getPendingAccumulatedFunds(address _receiver)
		public
		view
		returns (uint256 accumulatedFunds)
	{
		if (_isPeriodCompleted()) {
			uint256 totalBlocks;
			uint256 currentPerPeriodRate;
			uint256 perPeriodReleaseRate;
			uint256 perBlockReleaseRate;
			uint256 periodEndBlock = startBlock + changeRateAfterPeriod;

			// get total blocks before periods completed i.e periodsLastBlock - lastupdated block
			totalBlocks = periodEndBlock - lastFundUpdatedBlock;

			accumulatedFunds =
				(currentReleaseRatePerBlock * totalBlocks * getFundReceiverShare(_receiver)) /
				shareMultiplier;

			// calculate number of periods before last update happened
			uint256 totalPeriodsCompleted = (block.number - (periodEndBlock)) / changeRateAfterPeriod;

			if (totalPeriodsCompleted > 0) {
				currentPerPeriodRate = currentReleaseRatePerPeriod;
				do {
					// get correct release rate according to periods
					(perPeriodReleaseRate, perBlockReleaseRate) = _getReleaseRateValues(
						int256(currentPerPeriodRate)
					);

					accumulatedFunds +=
						(perBlockReleaseRate * changeRateAfterPeriod * getFundReceiverShare(_receiver)) /
						shareMultiplier;

					periodEndBlock = periodEndBlock + changeRateAfterPeriod;
					currentPerPeriodRate = perPeriodReleaseRate;
				} while ((block.number - periodEndBlock) > changeRateAfterPeriod);
			}

			// total blocks passed in the current period
			totalBlocks = block.number - periodEndBlock;

			if (totalBlocks > 0) {
				(perPeriodReleaseRate, perBlockReleaseRate) = _getReleaseRateValues(
					int256(currentPerPeriodRate)
				);

				accumulatedFunds +=
					(perBlockReleaseRate * totalBlocks * getFundReceiverShare(_receiver)) /
					shareMultiplier;
			}
		} else {
			accumulatedFunds =
				(currentReleaseRatePerBlock * getMultiplier() * getFundReceiverShare(_receiver)) /
				shareMultiplier;
		}
	}

	/**
	 * This method returns the multiplier
	 */
	function getMultiplier() public view returns (uint256) {
		return (block.number - lastFundUpdatedBlock);
	}

	/**
	 * @notice Returns the storage, major, minor, and patch version of the contract.
	 * @return The storage, major, minor, and patch version of the contract.
	 */
	function getVersionNumber() public pure virtual override returns (string memory) {
		return '1.0.0';
	}

	/*
   =======================================================================
   ======================== Internal Methods =============================
   =======================================================================
 	*/
	/**
	 * @notice This method allows admin to add the allocator address to be able to claim/receive LAC tokens.
	 * @param _account indicates the address to add. 100 =1%
	 */
	function _addFundReceiverAddress(address _account, uint256 _share) internal {
		LacTokenUtils.addAddressInList(fundReceiversList, _account);
		fundReceivers[_account] = FundReceiver(_share, 0);
		totalShares += _share;

		emit ReceiverAdded(_account, _share);
	}

	function _isPeriodCompleted() public view returns (bool isCompleted) {
		if (block.number > (startBlock + changeRateAfterPeriod)) return true;
	}

	/**
	 * @notice This method updates the totalAllocated funds for each receiver
	 */
	function _updateAllocatedFunds() internal virtual {
		if (getMultiplier() > 0) {
			// update totalAllocated funds for all fundReceivers
			for (uint256 i = 0; i < fundReceiversList.length; i++) {
				uint256 funds = getPendingAccumulatedFunds(fundReceiversList[i]);

				fundReceivers[fundReceiversList[i]].totalAccumulatedFunds += funds;
			}

			if (_isPeriodCompleted() && currentReleaseRatePerPeriod != finalReleaseRatePerPeriod) {
				uint256 periodEndBlock = startBlock + changeRateAfterPeriod;

				// calculate number of periods before last update happened
				uint256 totalPeriodsCompleted = (block.number - (periodEndBlock)) / changeRateAfterPeriod;

				_updateReleaseRate();

				for (uint256 i = 0; i < totalPeriodsCompleted; i++) {
					if (currentReleaseRatePerPeriod == finalReleaseRatePerPeriod) {
						break;
					}
					_updateReleaseRate();
				}
			}
			lastFundUpdatedBlock = block.number;
		}
	}

	function _updateReleaseRate() internal {
		(uint256 perPeriodReleaseRate, uint256 perBlockReleaseRate) = _getReleaseRateValues(
			int256(currentReleaseRatePerPeriod)
		);

		currentReleaseRatePerPeriod = perPeriodReleaseRate;
		currentReleaseRatePerBlock = perBlockReleaseRate;

		// update start time
		startBlock = startBlock + changeRateAfterPeriod;
	}

	function _getReleaseRateValues(int256 _currentPerPeriodReleaseRate)
		internal
		view
		returns (uint256 perPeriodReleaseRate, uint256 perBlockReleaseRate)
	{
		// calculate amount to increase by
		int256 increaseAmount = (_currentPerPeriodReleaseRate * changePercentage) / 10000;

		if (increaseAmount < 0) {
			if ((_currentPerPeriodReleaseRate + increaseAmount) < int256(finalReleaseRatePerPeriod)) {
				// set per period release rate to max release rate in case current release rate exceeds min release rate
				perPeriodReleaseRate = finalReleaseRatePerPeriod;
			} else {
				perPeriodReleaseRate = uint256(_currentPerPeriodReleaseRate + increaseAmount);
			}
		} else {
			if ((_currentPerPeriodReleaseRate + increaseAmount) > int256(finalReleaseRatePerPeriod)) {
				// set per period release rate to max release rate in case current release rate exceeds max release rate
				perPeriodReleaseRate = finalReleaseRatePerPeriod;
			} else {
				perPeriodReleaseRate = uint256(_currentPerPeriodReleaseRate + increaseAmount);
			}
		}

		// update per block release rate
		perBlockReleaseRate = perPeriodReleaseRate / totalBlocksPerPeriod;
	}

	function _hash(
		uint256 _amount,
		address _receiver,
		uint256 _nonce,
		uint256 _referenceNumber
	) internal view returns (bytes32) {
		return
			_hashTypedDataV4(
				keccak256(
					abi.encode(
						keccak256(
							'Claim(address account,uint256 amount,address receiver,uint256 nonce,uint256 referenceNumber)'
						),
						msg.sender,
						_amount,
						_receiver,
						_nonce,
						_referenceNumber
					)
				)
			);
	}

	function _verify(bytes32 _digest, bytes memory _signature) internal view returns (bool) {
		return hasRole(VAULT_KEEPER, ECDSAUpgradeable.recover(_digest, _signature));
	}
}
