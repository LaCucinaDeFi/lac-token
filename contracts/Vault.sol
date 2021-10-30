pragma solidity ^0.8.0;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/cryptography/draft-EIP712Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol';

import './library/LaCucinaUtils.sol';

contract Vault is EIP712Upgradeable, AccessControlUpgradeable, ReentrancyGuardUpgradeable {
	using CountersUpgradeable for CountersUpgradeable.Counter;

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
	bytes32 public constant OPERATOR_ROLE = keccak256('OPERATOR_ROLE');

	/*
   =======================================================================
   ======================== Private Variables ============================
   =======================================================================
 */

	/*
   =======================================================================
   ======================== Public Variables ============================
   =======================================================================
 */
	IERC20Upgradeable public LacToken;

	uint256 public totalShares;
	uint256 public startTime;
	uint256 public currentReleaseRatePerWeek;
	uint256 public currentReleaseRatePerBlock;
	uint256 public maxReleaseRatePerWeek;

	uint256 public increasePercentage;
	uint256 public increaseRateAfterWeeks;

	uint256 public lastFundUpdatedTimestamp;

	address[] public fundReceiversList;

	/// fundReceiver => share percentage
	mapping(address => FundReceiver) public fundReceivers;

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
		string memory _version,
		address _lacAddress,
		uint256 _initialReleaseRatePerWeek,
		uint256 _maxReleaseRatePerWeek,
		uint256 _increasePercent,
		uint256 _increaseRateAfterWeek
	) external virtual initializer {
		require(_lacAddress != address(0), 'Vault: INVALID_LAC_ADDRESS');

		__AccessControl_init();
		__ReentrancyGuard_init();
		__EIP712_init(_name, _version);

		_setupRole(DEFAULT_ADMIN_ROLE, _msgSender());

		LacToken = IERC20Upgradeable(_lacAddress);

		startTime = block.timestamp;
		currentReleaseRatePerWeek = _initialReleaseRatePerWeek;

		// calculate per block release rate ex. 300000 / ( 1 week / 3). considering 3 secs as binance block time
		currentReleaseRatePerBlock = currentReleaseRatePerWeek / (1 weeks / 3);

		maxReleaseRatePerWeek = _maxReleaseRatePerWeek;
		increasePercentage = _increasePercent;
		increaseRateAfterWeeks = _increaseRateAfterWeek;
		lastFundUpdatedTimestamp = block.timestamp;
	}

	/*
   	=======================================================================
   	======================== Modifiers ====================================
   	=======================================================================
 	*/

	modifier onlyAdmin() {
		require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), 'Vault: ONLY_ADMIN_CAN_CALL');
		_;
	}

	modifier onlyOperator() {
		require(hasRole(OPERATOR_ROLE, _msgSender()), 'Vault: ONLY_OPERATOR_CAN_CALL');
		_;
	}

	/*
  	=======================================================================
   	======================== Public Methods ===============================
   	=======================================================================
 	*/

	/**
	 * @notice This method allows operators to claim the specified amount of LAC tokens from the fundReceiver
	 * @param  _amount - indicates the amount of tokens to claim
	 * @param _receiver - indicates the fund receiver address from which funds to claim
	 * @param _signature - indicates the singature for claiming the tokens
	 */
	function claim(
		uint256 _amount,
		address _receiver,
		bytes calldata _signature
	) external {
		(bool isExists, ) = LaCucinaUtils.isAddressExists(fundReceiversList, _receiver);
		require(isExists, 'Vault: RECEIVER_DOES_NOT_EXISTS');

		// update allocated funds
		updateAllocatedFunds();

		require(
			_amount > 0 && _amount <= fundReceivers[_receiver].totalAccumulatedFunds,
			'Vault: INSUFFICIENT_AMOUNT'
		);
		require(_verify(_hash(_amount, _receiver), _signature), 'Vault: INVALID_SIGNATURE');

		require(LacToken.transfer(msg.sender, _amount), 'Vault: TRANSFER_FAILED');

		fundReceivers[_receiver].totalAccumulatedFunds -= _amount;
	}

	/**
	 * @notice This method allows admin to add the allocator address to be able to claim/receive LAC tokens.
	 * @param _account indicates the address to add.
	 */
	function addFundReceiverAddress(address _account, uint256 _share) external virtual onlyAdmin {
		LaCucinaUtils.addAddressInList(fundReceiversList, _account);
		fundReceivers[_account] = FundReceiver(_share, 0);
		totalShares += _share;
	}

	/**
	 * @notice This method allows admin to remove the allocator address from being able to claim/receive LAC tokens.
	 * @param _account indicates the address to remove.
	 */
	function removeFundReceiverAddress(address _account) external virtual onlyAdmin {
		LaCucinaUtils.removeAddressFromList(fundReceiversList, _account);

		// update total shares
		totalShares -= fundReceivers[_account].lacShare;

		delete fundReceivers[_account];
	}

	/**
	 * @notice This method allows admin to update the receiver`s share
	 * @param _receiver - indicates the address of the fundReceiver
	 * @param _newShare - indicates the new share for the fundReceiver. ex. 100 = 1%
	 */
	function updateReceiverShare(address _receiver, uint256 _newShare) external virtual onlyAdmin {
		(bool isExists, ) = LaCucinaUtils.isAddressExists(fundReceiversList, _receiver);
		require(isExists, 'Vault: RECEIVER_DOES_NOT_EXISTS');
		uint256 currentShare = fundReceivers[_receiver].lacShare;
		require(currentShare != _newShare, 'Vault: INVALID_SHARE');

		if (_newShare > currentShare) {
			totalShares = (totalShares - fundReceivers[_receiver].lacShare) + _newShare;
			fundReceivers[_receiver].lacShare = _newShare;
		} else {
			totalShares = (totalShares - fundReceivers[_receiver].lacShare) - _newShare;
			fundReceivers[_receiver].lacShare = _newShare;
		}
	}

	/**
	 * @notice This method updates the totalAllocated funds for each receiver
	 */
	function updateAllocatedFunds() public {
		if (getMultiplier() > 0) {
			// update totalAllocated funds for all fundReceivers
			for (uint256 i = 0; i < fundReceiversList.length; i++) {
				fundReceivers[fundReceiversList[i]].totalAccumulatedFunds += _getAccumulatedFunds(
					fundReceiversList[i]
				);
			}

			if (_isWeeksCompleted()) {
				_updateReleaseRate();
			}

			lastFundUpdatedTimestamp = block.timestamp;
		}
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
		return fundReceivers[_receiver].lacShare / totalShares;
	}

	/**
	 * This method returns fundReceiver`s accumulated funds
	 */
	function _getAccumulatedFunds(address _receiver)
		internal
		view
		virtual
		returns (uint256 accumulatedFunds)
	{
		if (_isWeeksCompleted()) {
			uint256 totalBlocks;
			uint256 weekEndTime = startTime + increaseRateAfterWeeks;

			// calculate number of weeks before last update happened
			uint256 totalWeeksCompleted = (block.timestamp - (weekEndTime)) / increaseRateAfterWeeks;

			if (totalWeeksCompleted > 0) {
				totalBlocks = (totalWeeksCompleted * 1 weeks) / 3;
			} else {
				// total blocks passed in the current week
				totalBlocks = (block.timestamp - (weekEndTime)) / 3;

				// todo - get total blocks before weeks completed i.e weeksLastTimestamp - lastupdated timestamp
				totalBlocks += ((weekEndTime) - lastFundUpdatedTimestamp) / 3;

				if (totalBlocks > 0) {
					accumulatedFunds =
						currentReleaseRatePerBlock *
						totalBlocks *
						getFundReceiverShare(_receiver);
				} else {
					accumulatedFunds = currentReleaseRatePerBlock * getFundReceiverShare(_receiver);
				}
			}
		} else {
			uint256 multiplier = getMultiplier();

			if (multiplier > 0) {
				accumulatedFunds =
					currentReleaseRatePerBlock *
					multiplier *
					getFundReceiverShare(_receiver);
			} else {
				accumulatedFunds = currentReleaseRatePerBlock * getFundReceiverShare(_receiver);
			}
		}
	}

	/**
	 * This method returns the multiplier
	 */
	function getMultiplier() public view virtual returns (uint256) {
		return (block.timestamp - lastFundUpdatedTimestamp) / 3;
	}

	/*
   	=======================================================================
   	======================== Internal Methods ===============================
   	=======================================================================
 	*/
	function _isWeeksCompleted() internal view returns (bool) {
		if (block.timestamp > (startTime + increaseRateAfterWeeks)) return true;
		return false;
	}

	function _updateReleaseRate() internal {
		// calculate amount to increase by
		uint256 increaseAmount = currentReleaseRatePerWeek * (increasePercentage / 100);

		if ((currentReleaseRatePerWeek + increaseAmount) > maxReleaseRatePerWeek) {
			// set per week release rate to max release rate in case current release rate exceeds max release rate
			currentReleaseRatePerWeek = maxReleaseRatePerWeek;
		} else {
			currentReleaseRatePerWeek += increaseAmount;
		}

		// update per block release rate
		currentReleaseRatePerBlock = currentReleaseRatePerWeek / (1 weeks / 3);

		// update start time
		startTime = block.timestamp;
	}

	function _hash(uint256 _amount, address _receiver) internal view returns (bytes32) {
		return
			_hashTypedDataV4(
				keccak256(
					abi.encode(
						keccak256('claim(address user,uint256 amount,address receiver)'),
						msg.sender,
						_amount,
						_receiver
					)
				)
			);
	}

	function _verify(bytes32 _digest, bytes memory _signature) internal view returns (bool) {
		return hasRole(OPERATOR_ROLE, ECDSAUpgradeable.recover(_digest, _signature));
	}
}
