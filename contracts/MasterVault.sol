// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol';

import './interfaces/IVersionedContract.sol';
import './interfaces/IMasterVault.sol';
import './interfaces/ILogicBase.sol';

contract MasterVault is
	OwnableUpgradeable,
	ReentrancyGuardUpgradeable,
	PausableUpgradeable,
	IVersionedContract,
	IMasterVault
{
	using CountersUpgradeable for CountersUpgradeable.Counter;

	/*
   =======================================================================
   ======================== Structures ===================================
   =======================================================================
 */

	struct LogicContract {
		string name;
		address logicAddress;
		bool isActive;
		uint256 registrationTime;
	}

	/*
   =======================================================================
   ======================== Constants ====================================
   =======================================================================
 */
	/**
	 * @notice indicates the logic contract interface Id.
	 * This id is calculated using this logic -> bytes4(type(IVaultLogic).interfaceId)
	 */
	bytes4 public constant LOGIC_INTERFACE_ID = 0x73325515;

	/*
   =======================================================================
   ======================== Private Variables ============================
   =======================================================================
 */

	CountersUpgradeable.Counter internal logicContractCounter;

	/*
   =======================================================================
   ======================== Public Variables ============================
   =======================================================================
 */

	/// @notice duration in seconds after which logic contract will be able to claim the tokens from Vault.
	uint256 public dormantDurationInSeconds;

	/// @notice logicContractId => LogicContract
	mapping(uint256 => LogicContract) public logicContracts;

	/// @notice logicContractAddress => LogicContractId
	mapping(address => uint256) public logicContractIds;

	/// @notice BEP20/ERC20 token address => isSupported
	mapping(address => bool) public supportedTokens;

	/*
   =======================================================================
   ======================== Constructor/Initializer ======================
   =======================================================================
 	*/

	/**
	 * @notice Used in place of the constructor to allow the contract to be upgradable via proxy.
	 */
	function initialize(uint256 _dormantDurationInSeconds) external virtual initializer {
		__Ownable_init();
		__ReentrancyGuard_init();
		__Pausable_init();

		dormantDurationInSeconds = _dormantDurationInSeconds;
	}

	/*
   =======================================================================
   ======================== Events ====================================
   =======================================================================
 	*/

	event TokenWithdraw(address indexed user, address indexed tokenAddress, uint256 indexed amount);
	event SupportedTokenAdded(address indexed tokenAddress);
	event SupportedTokenRemoved(address indexed tokenAddress);

	/*
   =======================================================================
   ======================== Modifiers ====================================
   =======================================================================
 	*/
	modifier isSupportedToken(address _tokenAddress) {
		require(supportedTokens[_tokenAddress], 'MasterVault: UNSUPPORTED_TOKEN');
		_;
	}

	/*
   =======================================================================
   ======================== Public Methods ===============================
   =======================================================================
 	*/
	function supportsInterface(bytes4 interfaceId)
		public
		view
		virtual
		override(IERC165Upgradeable)
		returns (bool)
	{
		return
			interfaceId == type(IMasterVault).interfaceId ||
			interfaceId == type(IERC165Upgradeable).interfaceId;
	}

	/**
	 * @notice This method allows owner to add the logic contract to be able to claim the supported tokens
	 * @param _logicContractAddress - logic contract address
	 * @param _name - name of logic contract
	 * @return logicContractId - newly generated logic contract id
	 */
	function addLogicContract(address _logicContractAddress, string memory _name)
		external
		virtual
		override
		onlyOwner
		returns (uint256 logicContractId)
	{
		require(
			_logicContractAddress != address(0) && AddressUpgradeable.isContract(_logicContractAddress),
			'MasterVault: INVALID_CONTRACT'
		);

		require(
			IERC165Upgradeable(_logicContractAddress).supportsInterface(LOGIC_INTERFACE_ID),
			'MasterVault: INVALID_LOGIC_CONTRACT'
		);

		require(ILogicBase(_logicContractAddress).isSetup(), 'MasterVault: LOGIC_NOT_SETUP');

		// increment logic contract id
		logicContractCounter.increment();

		logicContractId = logicContractCounter.current();

		logicContracts[logicContractId] = LogicContract(
			_name,
			_logicContractAddress,
			true,
			block.timestamp
		);

		logicContractIds[_logicContractAddress] = logicContractId;

		emit LogicContractAdded(logicContractId, _logicContractAddress, block.timestamp);
	}

	/**
	 * @notice This method allows owner to deactivate the logic contract from claiming the supported tokens
	 * @param _logicContractId - indicates the id of logic contract to deactivate
	 */
	function deactivateLogicContract(uint256 _logicContractId) external virtual override onlyOwner {
		require(
			_logicContractId > 0 && _logicContractId <= logicContractCounter.current(),
			'MasterVault: INVALID_ID'
		);

		require(logicContracts[_logicContractId].isActive, 'MasterVault: ALREADY_DEACTIVATED');

		logicContracts[_logicContractId].isActive = false;

		emit LogicContractDeactivated(
			_logicContractId,
			logicContracts[_logicContractId].logicAddress,
			block.timestamp
		);
	}

	/**
	 * @notice This method allows owner to reactivate the logic contract
	 * @param _logicContractId - indicates the id of logic contract to reactivate
	 */
	function reactivateLogicContract(uint256 _logicContractId) external virtual override onlyOwner {
		require(
			_logicContractId > 0 && _logicContractId <= logicContractCounter.current(),
			'MasterVault: INVALID_ID'
		);

		require(!logicContracts[_logicContractId].isActive, 'MasterVault: ALREADY_ACTIVE');

		logicContracts[_logicContractId].isActive = true;

		emit LogicContractReactivated(
			_logicContractId,
			logicContracts[_logicContractId].logicAddress,
			block.timestamp
		);
	}

	/**
	 * @notice This method allows the logic contracts to claim the supported tokens for user.
	 * @param _account - account to which supported tokens will be transferred
	 * @param _tokenAddress - supported  ERC20/BEP20 token address
	 * @param _amount - amount of tokens to claim
	 */
	function claim(
		address _account,
		address _tokenAddress,
		uint256 _amount
	)
		external
		virtual
		override
		nonReentrant
		whenNotPaused
		isSupportedToken(_tokenAddress)
		returns (bool)
	{
		require(
			logicContracts[logicContractIds[msg.sender]].isActive,
			'MasterVault: INACTIVE_LOGIC_CONTRACT'
		);
		require(
			block.timestamp >
				logicContracts[logicContractIds[msg.sender]].registrationTime + dormantDurationInSeconds,
			'MasterVault: CLAIM_DURING_DORMANT_STATE'
		);
		require(_account != address(0), 'MasterVault: INVALID_USER');

		require(
			AddressUpgradeable.isContract(msg.sender) && isOneOfLogicContract(msg.sender),
			'MasterVault: INVALID_CALLER'
		);

		uint256 vaultBalance = IERC20Upgradeable(_tokenAddress).balanceOf(address(this));
		require(vaultBalance >= _amount, 'MasterVault: INSUFFCIENT_TOKENS');

		require(
			IERC20Upgradeable(_tokenAddress).transfer(_account, _amount),
			'MasterVault: TRANSFER_FAILED'
		);

		emit VaultClaim(msg.sender, _account, _amount, block.timestamp);

		return true;
	}

	/**
	 * @notice This method allows admin to update the dormant duration
	 * @param _newDurationInSeconds - new duration to set in seconds.
	 */
	function updateDormantDuration(uint256 _newDurationInSeconds)
		external
		virtual
		override
		onlyOwner
	{
		require(dormantDurationInSeconds != _newDurationInSeconds, 'MasterVault: ALREADY_SET');
		uint256 oldDuration = dormantDurationInSeconds;

		dormantDurationInSeconds = _newDurationInSeconds;

		emit DormantDurationUpdated(oldDuration, _newDurationInSeconds);
	}

	/**
	 * @notice This method allows owner to claim all the tokens of specified token address to given address.
	 * This method does not allows to claim the supported tokens. ex. LAC, PMA
	 */
	function claimAllTokens(address _user, address _tokenAddress) external virtual onlyOwner {
		require(_user != address(0), 'MasterVault: INVALID_USER_ADDRESS');
		require(
			_tokenAddress != address(0) && supportedTokens[_tokenAddress] == false,
			'MasterVault: INVALID_TOKEN_ADDRESS'
		);

		uint256 tokenAmount = IERC20Upgradeable(_tokenAddress).balanceOf(address(this));

		require(IERC20Upgradeable(_tokenAddress).transfer(_user, tokenAmount));

		emit TokenWithdraw(_user, _tokenAddress, tokenAmount);
	}

	/**
	 * @notice This method allows admin to transfer specified amount of the tokens of specified address to given address
	 * This method does not allows to claim the supported tokens. ex. LAC, PMA
	 */
	function claimTokens(
		address _user,
		address _tokenAddress,
		uint256 _amount
	) external virtual onlyOwner {
		require(_user != address(0), 'MasterVault: INVALID_USER_ADDRESS');
		require(
			_tokenAddress != address(0) && !supportedTokens[_tokenAddress],
			'MasterVault: INVALID_TOKEN_ADDRESS'
		);

		require(IERC20Upgradeable(_tokenAddress).transfer(_user, _amount));

		emit TokenWithdraw(_user, _tokenAddress, _amount);
	}

	/**
	 * @notice This method allows operator to add the ERC20/BEP20 token which logic contracts can claim.
	 * @param _tokenAddress indicates the ERC20/BEP20 token address
	 */
	function addSupportedToken(address _tokenAddress) external virtual onlyOwner {
		require(!supportedTokens[_tokenAddress], 'MasterVault: TOKEN_ALREADY_ADDED');
		require(_tokenAddress != address(0), 'MasterVault: INVALID_TOKEN');
		supportedTokens[_tokenAddress] = true;

		emit SupportedTokenAdded(_tokenAddress);
	}

	/**
	 * @notice This method allows operator to remove the ERC20/BEP20 token from the supported token list.
	 * @param _tokenAddress indicates the ERC20/BEP20 token address
	 */
	function removeSupportedToken(address _tokenAddress)
		external
		virtual
		onlyOwner
		isSupportedToken(_tokenAddress)
	{
		delete supportedTokens[_tokenAddress];

		emit SupportedTokenRemoved(_tokenAddress);
	}

	/**
	 * @notice This method allows admin to pause the contract
	 */
	function pause() external virtual onlyOwner {
		_pause();
	}

	/**
	 * @notice This method allows admin to un-pause the contract
	 */
	function unPause() external virtual onlyOwner {
		_unpause();
	}

	/*
   =======================================================================
   ======================== Getter Methods ===============================
   =======================================================================
 	*/

	/**
	 * @notice This method returns the current logic contract id
	 */
	function getCurrentLogicContractId() external view returns (uint256) {
		return logicContractCounter.current();
	}

	/**
	 * @notice This method checks whether the given contract is logic contract or not
	 */
	function isOneOfLogicContract(address _contract)
		public
		view
		virtual
		override
		returns (bool isLogicContract)
	{
		return logicContractIds[_contract] > 0;
	}

	/**
	 * @notice Returns the major, minor, and patch version of the contract.
	 * @return The major, minor, and patch version of the contract.
	 */
	function getVersionNumber() public pure virtual override returns (string memory) {
		return '1.0.0';
	}
}
