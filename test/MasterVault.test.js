require('chai').should();

const Web3 = require('web3');
const {expect} = require('chai');
const {expectRevert, BN, ether, time, expectEvent} = require('@openzeppelin/test-helpers');
const {deployProxy} = require('@openzeppelin/truffle-upgrades');
const {ZERO_ADDRESS} = require('@openzeppelin/test-helpers/src/constants');
const {PRIVATE_KEY, PUBLIC_ADDRESS} = require('../secrets.test.json');
const {claim, createSignature} = require('./helper/helper');

const LacToken = artifacts.require('LacToken');
const TokenReleaseScheduleLogic = artifacts.require('TokenReleaseScheduleLogic');
const LogicContractMock = artifacts.require('LogicContractMock');
const Vault = artifacts.require('MasterVault');
const BlockData = artifacts.require('BlockData');
const SampleToken = artifacts.require('SampleToken');

function getReceiverShare(perBlockAmount, receiverShare, totalShare, totalBlocks) {
	return perBlockAmount.mul(totalBlocks).mul(receiverShare).div(totalShare);
}

function weiToEth(Value) {
	return Value.div(ether('1'));
}

contract.only('MasterVault', (accounts) => {
	const owner = accounts[0];
	const minter = accounts[1];
	const user1 = accounts[2];
	const user2 = accounts[3];
	const user3 = accounts[4];

	const vaultKeeper = accounts[8];
	const blocksPerPeriod = Number(time.duration.hours('1')) / 3;
	let currentPerBlockAmount;
	before('deploy contract', async () => {
		// deploy LAC token
		this.LacToken = await LacToken.new('Lacucina Token', 'LAC', minter, ether('500000000'));

		// deploy Sample token
		this.SampleToken = await SampleToken.new();

		// deploy Vault
		this.Vault = await deployProxy(Vault, [time.duration.hours('48')]);

		this.TokenReleaseScheduleLogic = await TokenReleaseScheduleLogic.new(
			this.Vault.address,
			this.LacToken.address,
			ether('100000'),
			ether('1000000'),
			500, // 5%
			blocksPerPeriod // 1 hours = 1200 blocks
		);

		// mint LAC tokens to minter
		this.web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8555'));

		// add account
		await this.web3.eth.accounts.wallet.add('0x' + PRIVATE_KEY);
		this.pk = Buffer.from(PRIVATE_KEY, 'hex');

		this.BlockData = await BlockData.new();
		this.chainId = await this.BlockData.getChainId();
	});

	describe('initialize Logic Contract', () => {
		it('should initialize Logic Contract correctly', async () => {
			const vaultAddress = await this.TokenReleaseScheduleLogic.Vault();
			const lacTokenAddress = await this.TokenReleaseScheduleLogic.Token();
			const startBlock = await this.TokenReleaseScheduleLogic.startBlock();
			const currentReleaseRatePerPeriod =
				await this.TokenReleaseScheduleLogic.currentReleaseRatePerPeriod();
			const currentReleaseRatePerBlock =
				await this.TokenReleaseScheduleLogic.currentReleaseRatePerBlock();
			const finalReleaseRatePerPeriod =
				await this.TokenReleaseScheduleLogic.finalReleaseRatePerPeriod();
			const changePercentage = await this.TokenReleaseScheduleLogic.changePercentage();
			const lastFundUpdatedBlock = await this.TokenReleaseScheduleLogic.lastFundUpdatedBlock();
			const blocksPerPeriod = await this.TokenReleaseScheduleLogic.blocksPerPeriod();

			console.log('currentReleaseRatePerBlock: ', currentReleaseRatePerBlock.toString());

			expect(vaultAddress).to.be.eq(this.Vault.address);
			expect(lacTokenAddress).to.be.eq(this.LacToken.address);
			expect(startBlock).to.bignumber.be.eq(new BN('0'));
			expect(currentReleaseRatePerPeriod).to.bignumber.be.eq(ether('100000'));
			expect(currentReleaseRatePerBlock).to.bignumber.be.eq(new BN('83333333333333333333'));
			expect(finalReleaseRatePerPeriod).to.bignumber.be.eq(ether('1000000'));
			expect(changePercentage).to.bignumber.be.eq(new BN('500'));
			expect(lastFundUpdatedBlock).to.bignumber.be.eq(startBlock);
			expect(blocksPerPeriod).to.bignumber.be.eq(
				new BN(Number(time.duration.hours(1).toString()) / 3)
			);

			currentPerBlockAmount = currentReleaseRatePerBlock;
		});
	});

	describe('setup()', () => {
		it('should revert when admin tries to setup logicContract with invalid receiver name', async () => {
			await expectRevert(
				this.TokenReleaseScheduleLogic.setup([''], [1000], {from: owner}),
				'TokenReleaseScheduleLogic: INVALID_NAME'
			);
		});

		it('should revert when admin tries to setup logicContract with invalid data', async () => {
			await expectRevert(
				this.TokenReleaseScheduleLogic.setup(['receiver2'], [1000, 2000], {from: owner}),
				'TokenReleaseScheduleLogic: INVALID_DATA'
			);
		});

		it('should setup the logicContract correctly', async () => {
			// add fund receiver1 and receiver2
			await this.TokenReleaseScheduleLogic.setup(['receiver1'], [9000], {from: owner});

			const currentBlock = await this.BlockData.getBlock();
			const startBlock = await this.TokenReleaseScheduleLogic.startBlock();
			const lastFundUpdatedBlock = await this.TokenReleaseScheduleLogic.lastFundUpdatedBlock();
			const fundReceiver1 = await this.TokenReleaseScheduleLogic.fundReceiversList(0);
			const totalShares = await this.TokenReleaseScheduleLogic.totalShares();
			const totalReceivers = await this.TokenReleaseScheduleLogic.getTotalFundReceivers();
			const isSetup = await this.TokenReleaseScheduleLogic.isSetup();
			const reeceiverDetails = await this.TokenReleaseScheduleLogic.fundReceivers(1);
			const initialStartBlock = await this.TokenReleaseScheduleLogic.initialStartBlock();

			expect(initialStartBlock).to.bignumber.be.eq(currentBlock);
			expect(startBlock).to.bignumber.be.eq(currentBlock);
			expect(lastFundUpdatedBlock).to.bignumber.be.eq(currentBlock);
			expect(fundReceiver1).to.bignumber.be.eq(new BN('1'));
			expect(isSetup).to.be.eq(true);
			expect(totalShares).to.bignumber.be.eq(new BN('9000'));
			expect(totalReceivers).to.bignumber.be.eq(new BN('1'));

			expect(reeceiverDetails.name).to.be.eq('receiver1');
			expect(reeceiverDetails.lacShare).to.bignumber.be.eq(new BN('9000'));
			expect(reeceiverDetails.totalAccumulatedFunds).to.bignumber.be.eq(new BN('0'));
		});

		it('should revert when non-admin tries to add setup logicContract', async () => {
			await expectRevert(
				this.TokenReleaseScheduleLogic.setup(['receiver1'], [9000], {from: user1}),
				'TokenReleaseScheduleLogic: ONLY_ADMIN_CAN_CALL'
			);
		});

		it('should revert when admin tries to setup logicContract again', async () => {
			await expectRevert(
				this.TokenReleaseScheduleLogic.setup(['receiver2'], [1000], {from: owner}),
				'TokenReleaseScheduleLogic: ALREADY_SETUP_DONE'
			);
		});
	});

	describe('MasterVault', () => {
		describe('initialize()', () => {
			it('Should initialize the MasterVault correctly', async () => {
				const dormantDurationInSeconds = await this.Vault.dormantDurationInSeconds();
				expect(dormantDurationInSeconds).to.bignumber.be.eq(new BN(time.duration.hours('48')));
			});
		});

		describe('supportsInterface()', () => {
			it('should support the IMasterVault interface correctly', async () => {
				// 0x6885e20e - IMasterVault interface id
				const isIMasterVaultSupport = await this.Vault.supportsInterface('0x6885e20e');

				expect(isIMasterVaultSupport).to.be.eq(true);
			});

			it('should support the IERC165 interface correctly', async () => {
				// 0x01ffc9a7 - IERC165 interface id
				const isIERC165Support = await this.Vault.supportsInterface('0x01ffc9a7');

				expect(isIERC165Support).to.be.eq(true);
			});
		});

		describe('addLogicContract()', () => {
			let logicIdBefore;
			before('', async () => {
				logicIdBefore = await this.Vault.getCurrentLogicContractId();

				// add logic contract
				this.addLogicContractTx = await this.Vault.addLogicContract(
					this.TokenReleaseScheduleLogic.address,
					'TokenReleaseScheduleLogic',
					{from: owner}
				);
			});

			it('should add the logic contract correctly', async () => {
				const logicIdAfter = await this.Vault.getCurrentLogicContractId();

				const logicDetails = await this.Vault.logicContracts(logicIdAfter);

				expect(logicIdBefore).to.bignumber.be.eq(new BN('0'));
				expect(logicIdAfter).to.bignumber.be.eq(new BN('1'));

				expect(logicDetails.name).to.be.eq('TokenReleaseScheduleLogic');
				expect(logicDetails.logicAddress).to.be.eq(this.TokenReleaseScheduleLogic.address);
				expect(logicDetails.isActive).to.be.eq(true);
				expect(logicDetails.registrationTime).to.bignumber.be.gt(new BN('0'));
			});

			it('it should emit event correctly', async () => {
				await expectEvent(this.addLogicContractTx, 'LogicContractAdded');
			});

			it('should revert when non-owner tries to add the logic contract', async () => {
				await expectRevert(
					this.Vault.addLogicContract(
						this.TokenReleaseScheduleLogic.address,
						'TokenReleaseScheduleLogic',
						{
							from: user1
						}
					),
					'Ownable: caller is not the owner'
				);
			});

			it('should revert when owner tries to add the logic contract with zero address', async () => {
				await expectRevert(
					this.Vault.addLogicContract(ZERO_ADDRESS, 'TokenReleaseScheduleLogic', {
						from: owner
					}),
					'MasterVault: INVALID_CONTRACT'
				);
			});

			it('should revert when owner tries to add the logic contract with EOA', async () => {
				await expectRevert(
					this.Vault.addLogicContract(user1, 'TokenReleaseScheduleLogic', {
						from: owner
					}),
					'MasterVault: INVALID_CONTRACT'
				);
			});

			it('should revert when owner tries to add the logic contract which does not support VaultLogic Interface', async () => {
				this.LogicContractMock = await LogicContractMock.new(
					this.Vault.address,
					this.LacToken.address,
					ether('100000'),
					ether('1000000'),
					500, // 5%
					blocksPerPeriod // 1 hours = 1200 blocks
				);

				await expectRevert(
					this.Vault.addLogicContract(this.LogicContractMock.address, 'LogicContractMock', {
						from: owner
					}),
					'MasterVault: INVALID_LOGIC_CONTRACT'
				);
			});

			it('should revert when owner tries to add the logic contract which is not been setup', async () => {
				this.tempLogicContract = await TokenReleaseScheduleLogic.new(
					this.Vault.address,
					this.LacToken.address,
					ether('100000'),
					ether('1000000'),
					500, // 5%
					blocksPerPeriod // 1 hours = 1200 blocks
				);

				await expectRevert(
					this.Vault.addLogicContract(this.tempLogicContract.address, 'TokenReleaseScheduleLogic', {
						from: owner
					}),
					'MasterVault: LOGIC_NOT_SETUP'
				);
			});
		});

		describe('deactivateLogicContract()', async () => {
			let currentLogicId;
			let logicContractDetailsBefore;
			before('', async () => {
				await this.tempLogicContract.setup(['receiver1'], [9000], {from: owner});

				await this.Vault.addLogicContract(
					this.tempLogicContract.address,
					'TokenReleaseScheduleLogic',
					{
						from: owner
					}
				);

				currentLogicId = await this.Vault.getCurrentLogicContractId();
				logicContractDetailsBefore = await this.Vault.logicContracts(currentLogicId);

				this.deactivateLogicContractTx = await this.Vault.deactivateLogicContract(currentLogicId, {
					from: owner
				});
			});

			it('should deactive the logic contract', async () => {
				const logicContractDetailsAfter = await this.Vault.logicContracts(currentLogicId);

				expect(currentLogicId).to.bignumber.be.eq(new BN('2'));

				expect(logicContractDetailsBefore.isActive).to.be.eq(true);
				expect(logicContractDetailsAfter.isActive).to.be.eq(false);
			});

			it('should emit an event after deactivating contract', async () => {
				await expectEvent(this.deactivateLogicContractTx, 'LogicContractDeactivated');
			});

			it('should revert when non-owner tries to deactivate the logic contract', async () => {
				await expectRevert(
					this.Vault.deactivateLogicContract(currentLogicId, {
						from: user1
					}),
					'Ownable: caller is not the owner'
				);
			});

			it('should revert when owner tries to deactivate the logic contract with invalid logicID', async () => {
				await expectRevert(
					this.Vault.deactivateLogicContract(0, {
						from: owner
					}),
					'MasterVault: INVALID_ID'
				);

				await expectRevert(
					this.Vault.deactivateLogicContract(10, {
						from: owner
					}),
					'MasterVault: INVALID_ID'
				);
			});

			it('should revert when owner tries to deactivate the logic contract which is already deactivated', async () => {
				await expectRevert(
					this.Vault.deactivateLogicContract(currentLogicId, {
						from: owner
					}),
					'MasterVault: ALREADY_DEACTIVATED'
				);
			});
		});

		describe('reactivateLogicContract()', async () => {
			let currentLogicId;
			let logicContractDetailsBefore;
			before('', async () => {
				currentLogicId = await this.Vault.getCurrentLogicContractId();
				logicContractDetailsBefore = await this.Vault.logicContracts(currentLogicId);

				this.reactivateLogicContractTx = await this.Vault.reactivateLogicContract(currentLogicId, {
					from: owner
				});
			});

			it('should reactive the logic contract', async () => {
				const logicContractDetailsAfter = await this.Vault.logicContracts(currentLogicId);

				expect(currentLogicId).to.bignumber.be.eq(new BN('2'));

				expect(logicContractDetailsBefore.isActive).to.be.eq(false);
				expect(logicContractDetailsAfter.isActive).to.be.eq(true);
			});

			it('should emit an event after deactivating contract', async () => {
				await expectEvent(this.reactivateLogicContractTx, 'LogicContractReactivated');
			});

			it('should revert when non-owner tries to reactivate the logic contract', async () => {
				await expectRevert(
					this.Vault.reactivateLogicContract(currentLogicId, {
						from: user1
					}),
					'Ownable: caller is not the owner'
				);
			});

			it('should revert when owner tries to deactivate the logic contract with invalid logicID', async () => {
				await expectRevert(
					this.Vault.reactivateLogicContract(0, {
						from: owner
					}),
					'MasterVault: INVALID_ID'
				);

				await expectRevert(
					this.Vault.reactivateLogicContract(10, {
						from: owner
					}),
					'MasterVault: INVALID_ID'
				);
			});

			it('should revert when owner tries to reactivate the logic contract which is already activated', async () => {
				await expectRevert(
					this.Vault.reactivateLogicContract(currentLogicId, {
						from: owner
					}),
					'MasterVault: ALREADY_ACTIVE'
				);
			});
		});

		describe('updateDormantDuration()', () => {
			let dormantDurationBefore;

			before('', async () => {
				dormantDurationBefore = await this.Vault.dormantDurationInSeconds();

				await this.Vault.updateDormantDuration(time.duration.minutes('10'), {from: owner});
			});

			it('should update the dormant duration correctly', async () => {
				const dormantDurationAfter = await this.Vault.dormantDurationInSeconds();

				expect(dormantDurationBefore).to.bignumber.be.eq(new BN(time.duration.days('2')));
				expect(dormantDurationAfter).to.bignumber.be.eq(new BN(time.duration.minutes('10')));
			});

			it('should revert when non-owner tries to update the dormant duration', async () => {
				await expectRevert(
					this.Vault.updateDormantDuration(time.duration.minutes('10'), {from: user1}),
					'Ownable: caller is not the owner'
				);
			});

			it('should revert when owner tries to update the dormant duration to already set value', async () => {
				await expectRevert(
					this.Vault.updateDormantDuration(time.duration.minutes('10'), {from: owner}),
					'MasterVault: ALREADY_SET'
				);
			});
		});

		describe('addSupportedToken()', () => {
			let isSupportedBefore;
			before('add supported token', async () => {
				isSupportedBefore = await this.Vault.supportedTokens(this.SampleToken.address);

				// add supported token
				await this.Vault.addSupportedToken(this.SampleToken.address, {from: owner});
			});

			it('should add supported token correctly', async () => {
				const isSupportedAfter = await this.Vault.supportedTokens(this.SampleToken.address);

				expect(isSupportedBefore).to.be.eq(false);
				expect(isSupportedAfter).to.be.eq(true);
			});

			it('should revert when admin tries to add token which is already supported', async () => {
				await expectRevert(
					this.Vault.addSupportedToken(this.SampleToken.address, {from: owner}),
					'MasterVault: TOKEN_ALREADY_ADDED'
				);
			});

			it('should revert when admin tries to add token which is zero address', async () => {
				await expectRevert(
					this.Vault.addSupportedToken(ZERO_ADDRESS, {from: owner}),
					'MasterVault: INVALID_TOKEN'
				);
			});

			it('should revert when non-admin tries to add the supported token', async () => {
				await expectRevert(
					this.Vault.addSupportedToken(this.SampleToken.address, {from: user2}),
					'Ownable: caller is not the owner'
				);
			});
		});

		describe('removeSupportedToken()', () => {
			let isSupportedBefore;
			before('remove supported token', async () => {
				isSupportedBefore = await this.Vault.supportedTokens(this.SampleToken.address);

				// remove supported token
				await this.Vault.removeSupportedToken(this.SampleToken.address, {from: owner});
			});

			it('should remove supported token correctly', async () => {
				const isSupportedAfter = await this.Vault.supportedTokens(this.SampleToken.address);

				expect(isSupportedBefore).to.be.eq(true);
				expect(isSupportedAfter).to.be.eq(false);
			});

			it('should revert when admin tries to remove token which does not supports already', async () => {
				await expectRevert(
					this.Vault.removeSupportedToken(this.SampleToken.address, {from: owner}),
					'MasterVault: TOKEN_DOES_NOT_EXISTS'
				);
			});

			it('should revert when non-admin tries to remove the supported token', async () => {
				await expectRevert(
					this.Vault.removeSupportedToken(this.SampleToken.address, {from: minter}),
					'Ownable: caller is not the owner'
				);
			});
		});

		describe('claim()', () => {
			let currentLogicId;
			const receiver1 = 1;
			before('', async () => {
				// mint tokens to MasterVault
				await this.LacToken.transfer(this.Vault.address, ether('100000'), {from: minter});

				const VAULT_KEEPER = await this.tempLogicContract.VAULT_KEEPER();

				await this.tempLogicContract.grantRole(VAULT_KEEPER, PUBLIC_ADDRESS);

				currentLogicId = await this.Vault.getCurrentLogicContractId();
			});

			it('should not allow logic contract to claim when logic contract is inactive', async () => {
				// deactivate temp logic contract
				await this.Vault.deactivateLogicContract(currentLogicId, {from: owner});

				await expectRevert(
					claim(
						this.tempLogicContract,
						user1,
						ether('1'),
						receiver1,
						this.pk,
						this.chainId,
						'TokenReleaseScheduleLogic'
					),
					'MasterVault: INACTIVE_LOGIC_CONTRACT'
				);
			});

			it('should not allow logic contract to claim when logic contract is in dormant duration', async () => {
				// deactivate temp logic contract
				await this.Vault.reactivateLogicContract(currentLogicId, {from: owner});

				await expectRevert(
					claim(
						this.tempLogicContract,
						user1,
						ether('1'),
						receiver1,
						this.pk,
						this.chainId,
						'TokenReleaseScheduleLogic'
					),
					'MasterVault: CLAIM_DURING_DORMANT_STATE'
				);
			});

			it('should revert when logic contract tries to claim for unsupported tokens', async () => {
				const currentBlock = await this.BlockData.getBlock();
				await time.increase(new BN(time.duration.minutes('11')));

				await expectRevert(
					claim(
						this.tempLogicContract,
						user1,
						ether('1'),
						receiver1,
						this.pk,
						this.chainId,
						'TokenReleaseScheduleLogic'
					),
					'MasterVault: CLAIM_FOR_UNSUPPORTED_TOKEN'
				);
			});

			it('should revert when logic contract tries to claim from vault when vault don`t have sufficient tokens', async () => {
				// claim all tokens
				await this.Vault.claimAllTokens(accounts[9], this.LacToken.address, {from: owner});

				// add supported token
				await this.Vault.addSupportedToken(this.LacToken.address, {from: owner});

				await expectRevert(
					claim(
						this.tempLogicContract,
						user1,
						ether('1'),
						receiver1,
						this.pk,
						this.chainId,
						'TokenReleaseScheduleLogic'
					),
					'MasterVault: INSUFFCIENT_TOKENS'
				);
			});

			it('should revert when logic contract tries to claim when Vault is paused', async () => {
				// pause contract
				await this.Vault.pause({from: owner});

				await expectRevert(
					claim(
						this.tempLogicContract,
						user1,
						ether('1'),
						receiver1,
						this.pk,
						this.chainId,
						'TokenReleaseScheduleLogic'
					),
					'Pausable: paused'
				);

				// unpause contract
				await this.Vault.unPause({from: owner});
			});

			it('should claim tokens correctly', async () => {
				await this.LacToken.transfer(this.Vault.address, ether('100000'), {from: minter});

				const user1BalBefore = await this.LacToken.balanceOf(user1);
				await claim(
					this.tempLogicContract,
					user1,
					ether('1'),
					receiver1,
					this.pk,
					this.chainId,
					'TokenReleaseScheduleLogic'
				);
				const user1BalAfter = await this.LacToken.balanceOf(user1);

				expect(user1BalAfter).to.bignumber.be.eq(user1BalBefore.add(ether('1')));
			});
		});

		describe('claimAllTokens()', () => {
			it('should claim tokens send to logicContract contract', async () => {
				//transfer tokens to Vault
				await this.SampleToken.mint(this.Vault.address, ether('5'), {
					from: owner
				});

				const logicContractTokenBalBefore = await this.SampleToken.balanceOf(this.Vault.address);
				const owenerTokenBalBefore = await this.SampleToken.balanceOf(owner);

				// claim all tokens
				await this.Vault.claimAllTokens(owner, this.SampleToken.address, {
					from: owner
				});

				const logicContractTokenBalAfter = await this.SampleToken.balanceOf(this.Vault.address);
				const owenerTokenBalAfter = await this.SampleToken.balanceOf(owner);

				expect(logicContractTokenBalBefore).to.bignumber.be.eq(ether('5'));
				expect(owenerTokenBalBefore).to.bignumber.be.eq(new BN('0'));

				expect(logicContractTokenBalAfter).to.bignumber.be.eq(new BN('0'));
				expect(owenerTokenBalAfter).to.bignumber.be.eq(ether('5'));
			});

			it('should revert when non-admin tries to claim all the tokens', async () => {
				await expectRevert(
					this.Vault.claimAllTokens(owner, this.SampleToken.address, {
						from: minter
					}),
					'Ownable: caller is not the owner'
				);
			});

			it('should revert when admin tries to claim all the tokens to zero user address', async () => {
				await expectRevert(
					this.Vault.claimAllTokens(ZERO_ADDRESS, this.SampleToken.address, {
						from: owner
					}),
					'MasterVault: INVALID_USER_ADDRESS'
				);
			});
			it('should revert when admin tries to claim all the tokens for zero token address', async () => {
				await expectRevert(
					this.Vault.claimAllTokens(owner, ZERO_ADDRESS, {from: owner}),
					'MasterVault: INVALID_TOKEN_ADDRESS'
				);
			});
			it('should revert when admin tries to claim all the tokens for LAC token address', async () => {
				await expectRevert(
					this.Vault.claimAllTokens(owner, this.LacToken.address, {
						from: owner
					}),
					'MasterVault: INVALID_TOKEN_ADDRESS'
				);
			});
		});

		describe('claimTokens()', () => {
			it('should claim specified amount of tokens send to Vault contract', async () => {
				//transfer tokens to Vault
				await this.SampleToken.mint(this.Vault.address, ether('5'), {
					from: owner
				});

				const logicContractTokenBalBefore = await this.SampleToken.balanceOf(this.Vault.address);
				const minterTokenBalBefore = await this.SampleToken.balanceOf(minter);

				// claim all tokens
				await this.Vault.claimTokens(minter, this.SampleToken.address, ether('4'), {
					from: owner
				});

				const logicContractTokenBalAfter = await this.SampleToken.balanceOf(this.Vault.address);
				const minterTokenBalAfter = await this.SampleToken.balanceOf(minter);

				expect(logicContractTokenBalBefore).to.bignumber.be.eq(ether('5'));

				expect(logicContractTokenBalAfter).to.bignumber.be.eq(ether('1'));
				expect(minterTokenBalAfter).to.bignumber.be.eq(minterTokenBalBefore.add(ether('4')));
			});

			it('should revert when non-admin tries to claim given no. of the tokens', async () => {
				await expectRevert(
					this.Vault.claimTokens(owner, this.SampleToken.address, ether('4'), {
						from: minter
					}),
					'Ownable: caller is not the owner'
				);
			});

			it('should revert when admin tries to claim  given no. of the tokens to zero user address', async () => {
				await expectRevert(
					this.Vault.claimTokens(ZERO_ADDRESS, this.SampleToken.address, ether('4'), {
						from: owner
					}),
					'MasterVault: INVALID_USER_ADDRESS'
				);
			});

			it('should revert when admin tries to claim  given no. of the tokens for zero token address', async () => {
				await expectRevert(
					this.Vault.claimTokens(owner, ZERO_ADDRESS, ether('4'), {
						from: owner
					}),
					'MasterVault: INVALID_TOKEN_ADDRESS'
				);
			});

			it('should revert when admin tries to claim  given no. of the tokens for supported token address', async () => {
				await expectRevert(
					this.Vault.claimTokens(owner, this.LacToken.address, ether('4'), {
						from: owner
					}),
					'MasterVault: INVALID_TOKEN_ADDRESS'
				);
			});

			it('should revert when admin tries to claim invalid amount of tokens', async () => {
				await expectRevert(
					this.Vault.claimTokens(owner, this.SampleToken.address, ether('5000000000000'), {
						from: owner
					}),
					'MasterVault: INSUFFICIENT_BALANCE'
				);
			});
		});

		describe('isOneOfLogicContract()', () => {
			it('should tell whether given contract is logic contract or not correctly', async () => {
				let isLogicContract = await this.Vault.isOneOfLogicContract(user1);
				expect(isLogicContract).to.be.eq(false);

				isLogicContract = await this.Vault.isOneOfLogicContract(
					this.TokenReleaseScheduleLogic.address
				);
				expect(isLogicContract).to.be.eq(true);
			});
		});
	});

	describe('addFundReceivers()', () => {
		before('add fundReceiver', async () => {
			// pause contract
			await this.TokenReleaseScheduleLogic.pause();

			// add fund receiver1 and receiver2
			await this.TokenReleaseScheduleLogic.addFundReceivers(['receiver2'], [1000], {from: owner});
		});

		it('should add fund receivers correctly', async () => {
			const fundReceiver1Id = await this.TokenReleaseScheduleLogic.fundReceiversList(0);
			const fundReceiver2Id = await this.TokenReleaseScheduleLogic.fundReceiversList(1);

			const fundReceiver1Details = await this.TokenReleaseScheduleLogic.fundReceivers(
				fundReceiver1Id
			);
			const fundReceiver2Details = await this.TokenReleaseScheduleLogic.fundReceivers(
				fundReceiver2Id
			);

			const receiver1Share = await this.TokenReleaseScheduleLogic.getFundReceiverShare(
				fundReceiver1Id
			);
			const receiver2Share = await this.TokenReleaseScheduleLogic.getFundReceiverShare(
				fundReceiver2Id
			);
			const totalShares = await this.TokenReleaseScheduleLogic.totalShares();
			const totalReceivers = await this.TokenReleaseScheduleLogic.getTotalFundReceivers();

			expect(fundReceiver1Id).to.bignumber.be.eq(new BN('1'));
			expect(fundReceiver2Id).to.bignumber.be.eq(new BN('2'));

			expect(fundReceiver1Details.lacShare).to.bignumber.be.eq(new BN('9000'));
			expect(fundReceiver1Details.totalAccumulatedFunds).to.bignumber.be.eq(
				new BN('5249999999999999999979')
			);

			expect(fundReceiver2Details.lacShare).to.bignumber.be.eq(new BN('1000'));
			expect(fundReceiver2Details.totalAccumulatedFunds).to.bignumber.be.eq(new BN('0'));

			expect(receiver1Share).to.bignumber.be.eq(new BN('900000000000'));
			expect(receiver2Share).to.bignumber.be.eq(new BN('100000000000'));
			expect(totalShares).to.bignumber.be.eq(new BN('10000'));
			expect(totalReceivers).to.bignumber.be.eq(new BN('2'));
		});

		it('should revert when non-admin tries to add the fund receiver', async () => {
			await expectRevert(
				this.TokenReleaseScheduleLogic.addFundReceivers(['receiver3'], [1000], {from: minter}),
				'TokenReleaseScheduleLogic: ONLY_ADMIN_CAN_CALL'
			);
		});

		it('should revert when admin tries to add the empty name for fund receiver', async () => {
			await expectRevert(
				this.TokenReleaseScheduleLogic.addFundReceivers([''], [1000], {from: owner}),
				'TokenReleaseScheduleLogic: INVALID_NAME'
			);
		});

		it('should revert when admin tries to add the fund receiver with invalid data', async () => {
			await expectRevert(
				this.TokenReleaseScheduleLogic.addFundReceivers(['receiver1', 'receiver2'], [1000], {
					from: owner
				}),
				'TokenReleaseScheduleLogic: INVALID_DATA'
			);
		});

		it('should revert when admin tries to add the fund receiver when contract is not pause', async () => {
			// unpause contract
			await this.TokenReleaseScheduleLogic.unPause();

			await expectRevert(
				this.TokenReleaseScheduleLogic.addFundReceivers(['receiver1'], [1000], {from: owner}),
				'Pausable: not paused'
			);
		});

		it('should allocate funds correctly when new receiver is added', async () => {
			const currentBlock = await this.BlockData.getBlock();
			//increase time by 3 blocks per day = 28800 Number(57600)
			await time.advanceBlockTo(Number(currentBlock.toString()) + Number(3));

			const fundReceiver1Details = await this.TokenReleaseScheduleLogic.fundReceivers(1); // 1 receiver1 id
			const fundReceiver2Details = await this.TokenReleaseScheduleLogic.fundReceivers(2); // 2 receiver2 id

			const receiver1Pendings = await this.TokenReleaseScheduleLogic.getPendingAccumulatedFunds(1);
			const receiver2Pendings = await this.TokenReleaseScheduleLogic.getPendingAccumulatedFunds(2);

			// pause contract
			await this.TokenReleaseScheduleLogic.pause();

			// // add third fund receiver
			await this.TokenReleaseScheduleLogic.shrinkReceiver(1, 'receiver3', 1000, {from: owner});
			// unpause contract
			await this.TokenReleaseScheduleLogic.unPause();

			const receiver1PendingsAfter =
				await this.TokenReleaseScheduleLogic.getPendingAccumulatedFunds(1);
			const receiver2PendingsAfter =
				await this.TokenReleaseScheduleLogic.getPendingAccumulatedFunds(2);

			const fundReceiver1DetailsAfter = await this.TokenReleaseScheduleLogic.fundReceivers(1);
			const fundReceiver2DetailsAfter = await this.TokenReleaseScheduleLogic.fundReceivers(2);
			const fundReceiver3DetailsAfter = await this.TokenReleaseScheduleLogic.fundReceivers(3);

			const totalShares = await this.TokenReleaseScheduleLogic.totalShares();

			const receiver1Share = getReceiverShare(
				currentPerBlockAmount,
				new BN('9000'),
				new BN('10000'),
				new BN('2')
			);
			const receiver2Share = getReceiverShare(
				currentPerBlockAmount,
				new BN('1000'),
				new BN('10000'),
				new BN('2')
			);

			// expect(fundReceiver1DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(
			// 	fundReceiver1Details.totalAccumulatedFunds.add(receiver1Pendings).add(receiver1Share)
			// );

			expect(fundReceiver2DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(
				fundReceiver2Details.totalAccumulatedFunds
					.add(receiver2Pendings)
					.add(receiver2Share)
					.add(new BN('1'))
			);

			expect(fundReceiver3DetailsAfter.lacShare).to.bignumber.be.eq(new BN('1000'));
			expect(fundReceiver3DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(new BN('0'));

			const receiver1Share1 = getReceiverShare(
				currentPerBlockAmount,
				new BN('8000'),
				new BN('10000'),
				new BN('1')
			);
			const receiver2Share2 = getReceiverShare(
				currentPerBlockAmount,
				new BN('1000'),
				new BN('10000'),
				new BN('1')
			);
			expect(receiver1PendingsAfter).to.bignumber.be.eq(receiver1Share1);
			expect(receiver2PendingsAfter).to.bignumber.be.eq(receiver2Share2);

			expect(totalShares).to.bignumber.be.eq(new BN('10000'));
		});
	});

	describe('removeFundReceiver()', () => {
		let totalRecieversBefore;
		let receiver1Pendings;
		let receiver2Pendings;
		let receiver3Pendings;
		let fundReceiver1Details;
		let fundReceiver2Details;
		let fundReceiver3Details;

		before('remove fund receiver', async () => {
			fundReceiver1Details = await this.TokenReleaseScheduleLogic.fundReceivers(1);
			fundReceiver2Details = await this.TokenReleaseScheduleLogic.fundReceivers(2);
			fundReceiver3Details = await this.TokenReleaseScheduleLogic.fundReceivers(3);

			totalRecieversBefore = await this.TokenReleaseScheduleLogic.getTotalFundReceivers();

			// pause contract
			await this.TokenReleaseScheduleLogic.pause();

			// remove receiver3
			await this.TokenReleaseScheduleLogic.removeFundReceiver(3, {from: owner});
		});

		it('should remove the fundReceiver correctly', async () => {
			const totalReceivers = await this.TokenReleaseScheduleLogic.getTotalFundReceivers();
			const totalShare = await this.TokenReleaseScheduleLogic.totalShares();

			const fundReceiver1DetailsAfter = await this.TokenReleaseScheduleLogic.fundReceivers(1);
			const fundReceiver2DetailsAfter = await this.TokenReleaseScheduleLogic.fundReceivers(2);
			const fundReceiver3DetailsAfter = await this.TokenReleaseScheduleLogic.fundReceivers(3);

			const receiver1Share = getReceiverShare(
				currentPerBlockAmount,
				new BN('8000'),
				new BN('10000'),
				new BN('2')
			);
			const receiver2Share = getReceiverShare(
				currentPerBlockAmount,
				new BN('1000'),
				new BN('10000'),
				new BN('3')
			);

			const receiver1Share1 = getReceiverShare(
				currentPerBlockAmount,
				new BN('8000'),
				new BN('10000'),
				new BN('1')
			);

			expect(totalRecieversBefore).to.bignumber.be.eq(new BN('3'));
			expect(totalReceivers).to.bignumber.be.eq(new BN('2'));
			expect(totalShare).to.bignumber.be.eq(new BN('9000'));

			// expect(fundReceiver1DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(
			// 	fundReceiver1Details.totalAccumulatedFunds.add(receiver1Share).add(receiver1Share1)
			// );

			expect(fundReceiver2DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(
				fundReceiver2Details.totalAccumulatedFunds.add(receiver2Share)
			);
			expect(fundReceiver3DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(new BN('0'));
			expect(fundReceiver3DetailsAfter.lacShare).to.bignumber.be.eq(new BN('0'));

			expect(fundReceiver3Details.totalAccumulatedFunds).to.bignumber.be.eq(new BN('0'));
			expect(fundReceiver3Details.lacShare).to.bignumber.be.eq(new BN('1000'));

			expect(fundReceiver1DetailsAfter.lacShare).to.bignumber.be.eq(new BN('8000'));

			const receiver1PendingsAfter =
				await this.TokenReleaseScheduleLogic.getPendingAccumulatedFunds(1);
			const receiver2PendingsAfter =
				await this.TokenReleaseScheduleLogic.getPendingAccumulatedFunds(2);

			expect(receiver1PendingsAfter).to.bignumber.be.eq(new BN('0'));
			expect(receiver2PendingsAfter).to.bignumber.be.eq(new BN('0'));
		});

		it('should revert when non-admin tries remove the fund receiver address', async () => {
			await expectRevert(
				this.TokenReleaseScheduleLogic.removeFundReceiver(3, {from: minter}),
				'TokenReleaseScheduleLogic: ONLY_ADMIN_CAN_CALL'
			);
		});

		it('should revert when admin tries remove the fund receiver address which already removed', async () => {
			await expectRevert(
				this.TokenReleaseScheduleLogic.removeFundReceiver(3, {from: owner}),
				'LacTokenUtils: ITEM_DOES_NOT_EXISTS'
			);
		});

		it('should revert when admin tries remove the fund receiver when contract is not paused', async () => {
			// unpause contract
			await this.TokenReleaseScheduleLogic.unPause();

			await expectRevert(
				this.TokenReleaseScheduleLogic.removeFundReceiver(1, {from: owner}),
				'Pausable: not paused'
			);
		});
	});

	describe('updateReceiverShare()', () => {
		let receiver1DetailsBefore;
		let receiver1DetailsAfter;
		let totalSharesBefore;
		let totalSharesAfter;

		it('should decrease the receiver`s share correctly', async () => {
			receiver1DetailsBefore = await this.TokenReleaseScheduleLogic.fundReceivers(1);
			totalSharesBefore = await this.TokenReleaseScheduleLogic.totalShares();
			// pause contract
			await this.TokenReleaseScheduleLogic.pause();

			// update receiver1` share
			await this.TokenReleaseScheduleLogic.updateReceiverShare(1, new BN('7000'), {from: owner});

			receiver1DetailsAfter = await this.TokenReleaseScheduleLogic.fundReceivers(1);
			totalSharesAfter = await this.TokenReleaseScheduleLogic.totalShares();

			expect(receiver1DetailsBefore.lacShare).to.bignumber.be.eq(new BN('8000'));
			expect(receiver1DetailsAfter.lacShare).to.bignumber.be.eq(new BN('7000'));
			expect(totalSharesBefore).to.bignumber.be.eq(new BN('9000'));
			expect(totalSharesAfter).to.bignumber.be.eq(new BN('8000'));
		});

		it('should increase the receiver`s share correctly', async () => {
			receiver1DetailsBefore = await this.TokenReleaseScheduleLogic.fundReceivers(1);
			totalSharesBefore = await this.TokenReleaseScheduleLogic.totalShares();

			// update receiver1` share
			await this.TokenReleaseScheduleLogic.updateReceiverShare(1, new BN('9000'), {from: owner});

			receiver1DetailsAfter = await this.TokenReleaseScheduleLogic.fundReceivers(1);
			totalSharesAfter = await this.TokenReleaseScheduleLogic.totalShares();

			expect(receiver1DetailsBefore.lacShare).to.bignumber.be.eq(new BN('7000'));
			expect(receiver1DetailsAfter.lacShare).to.bignumber.be.eq(new BN('9000'));
			expect(totalSharesBefore).to.bignumber.be.eq(new BN('8000'));
			expect(totalSharesAfter).to.bignumber.be.eq(new BN('10000'));
		});

		it('should revert when non-owner tries to update the fundreceiver`s share', async () => {
			await expectRevert(
				this.TokenReleaseScheduleLogic.updateReceiverShare(1, new BN('7000'), {from: minter}),
				'TokenReleaseScheduleLogic: ONLY_ADMIN_CAN_CALL'
			);
		});
		it('should revert when owner tries to update the fundreceiver`s share with already set value', async () => {
			await expectRevert(
				this.TokenReleaseScheduleLogic.updateReceiverShare(1, new BN('9000'), {from: owner}),
				'TokenReleaseScheduleLogic: INVALID_SHARE'
			);
			await expectRevert(
				this.TokenReleaseScheduleLogic.updateReceiverShare(1, new BN('0'), {from: owner}),
				'TokenReleaseScheduleLogic: INVALID_SHARE'
			);
		});

		it('should revert when owner tries to update the non-existant fundreceiver`s share', async () => {
			await expectRevert(
				this.TokenReleaseScheduleLogic.updateReceiverShare(3, new BN('7000'), {from: owner}),
				'TokenReleaseScheduleLogic: RECEIVER_DOES_NOT_EXISTS'
			);
		});

		it('should revert when owner tries to update fundreceiver`s share when contract is unpaused', async () => {
			// unpause contract
			await this.TokenReleaseScheduleLogic.unPause();

			await expectRevert(
				this.TokenReleaseScheduleLogic.updateReceiverShare(1, new BN('7000'), {from: owner}),
				'Pausable: not paused'
			);
		});
	});

	describe('shrinkReceiver()', () => {
		let receiver1DetailsBefore;
		let receiver1DetailsAfter;
		let receiver3DetailsAfter;
		let totalSharesBefore;
		let totalSharesAfter;
		it('should shrink receiver correctly', async () => {
			receiver1DetailsBefore = await this.TokenReleaseScheduleLogic.fundReceivers(1);
			totalSharesBefore = await this.TokenReleaseScheduleLogic.totalShares();

			// pause contract
			await this.TokenReleaseScheduleLogic.pause();

			// shrink receiver
			await this.TokenReleaseScheduleLogic.shrinkReceiver(1, 'receiver3', new BN('1000'), {
				from: owner
			});

			receiver1DetailsAfter = await this.TokenReleaseScheduleLogic.fundReceivers(1);
			receiver3DetailsAfter = await this.TokenReleaseScheduleLogic.fundReceivers(4);
			totalSharesAfter = await this.TokenReleaseScheduleLogic.totalShares();

			const totalReceivers = await this.TokenReleaseScheduleLogic.getTotalFundReceivers();

			expect(totalReceivers).to.bignumber.be.eq(new BN('3'));
			expect(receiver1DetailsBefore.lacShare).to.bignumber.be.eq(new BN('9000'));
			expect(receiver1DetailsAfter.lacShare).to.bignumber.be.eq(new BN('8000'));
			expect(receiver3DetailsAfter.lacShare).to.bignumber.be.eq(new BN('1000'));

			expect(totalSharesBefore).to.bignumber.be.eq(new BN('10000'));
			expect(totalSharesAfter).to.bignumber.be.eq(new BN('10000'));
		});

		it('should revert when non-owner tries to shrink fund receiver', async () => {
			await expectRevert(
				this.TokenReleaseScheduleLogic.shrinkReceiver(1, 'receiver3', new BN('1000'), {
					from: user1
				}),
				'TokenReleaseScheduleLogic: ONLY_ADMIN_CAN_CALL'
			);
		});

		it('should revert when owner tries to shrink non-existing receiver', async () => {
			await expectRevert(
				this.TokenReleaseScheduleLogic.shrinkReceiver(7, 'receiver3', new BN('1000'), {
					from: owner
				}),
				'TokenReleaseScheduleLogic: RECEIVER_DOES_NOT_EXISTS'
			);
		});

		it('should revert when owner tries to shrink existing receiver with invalid share', async () => {
			await expectRevert(
				this.TokenReleaseScheduleLogic.shrinkReceiver(1, 'receiver3', new BN('10000'), {
					from: owner
				}),
				'TokenReleaseScheduleLogic: INVALID_SHARE'
			);
			await expectRevert(
				this.TokenReleaseScheduleLogic.shrinkReceiver(1, 'receiver3', new BN('8000'), {
					from: owner
				}),
				'TokenReleaseScheduleLogic: INVALID_SHARE'
			);
			await expectRevert(
				this.TokenReleaseScheduleLogic.shrinkReceiver(1, 'receiver3', new BN('0'), {from: owner}),
				'TokenReleaseScheduleLogic: INVALID_SHARE'
			);
		});

		it('should revert when owner tries to shrink receiver to add receiver with empty name', async () => {
			await expectRevert(
				this.TokenReleaseScheduleLogic.shrinkReceiver(1, '', new BN('5000'), {from: owner}),
				'TokenReleaseScheduleLogic: INVALID_NAME'
			);
		});

		it('should revert when owner tries to shrink receiver to add receiver when contract is unpaused', async () => {
			// unpause contract
			await this.TokenReleaseScheduleLogic.unPause();

			await expectRevert(
				this.TokenReleaseScheduleLogic.shrinkReceiver(1, 'receiver1', new BN('5000'), {
					from: owner
				}),
				'Pausable: not paused'
			);
		});
	});

	describe('updateTokenReleaseScheduleLogicParams()', async () => {
		let currentReleaseRatePerPeriod;
		let currentReleaseRatePerBlock;
		let finalReleaseRatePerPeriod;
		let changePercentage;
		let blocksPerPeriod;
		let startBlock;
		let currentBlock;
		const receiver1 = 1;
		const receiver2 = 2;
		const receiver3 = 4;
		describe('update currentReleaseRatePerPeriod', () => {
			it('should update the currentReleaseRatePerPeriod correctly', async () => {
				currentReleaseRatePerPeriod =
					await this.TokenReleaseScheduleLogic.currentReleaseRatePerPeriod();
				currentReleaseRatePerBlock =
					await this.TokenReleaseScheduleLogic.currentReleaseRatePerBlock();
				finalReleaseRatePerPeriod =
					await this.TokenReleaseScheduleLogic.finalReleaseRatePerPeriod();
				changePercentage = await this.TokenReleaseScheduleLogic.changePercentage();
				blocksPerPeriod = await this.TokenReleaseScheduleLogic.blocksPerPeriod();
				startBlock = await this.TokenReleaseScheduleLogic.startBlock();

				const currentReleaserateBefore =
					await this.TokenReleaseScheduleLogic.getCurrentReleaseRate();

				const receiver1DetailsBefore = await this.TokenReleaseScheduleLogic.fundReceivers(
					receiver1
				);
				const receiver1Pending = await this.TokenReleaseScheduleLogic.getPendingAccumulatedFunds(
					receiver1
				);

				const receiver2DetailsBefore = await this.TokenReleaseScheduleLogic.fundReceivers(
					receiver2
				);
				const receiver2Pending = await this.TokenReleaseScheduleLogic.getPendingAccumulatedFunds(
					receiver2
				);

				const receiver3DetailsBefore = await this.TokenReleaseScheduleLogic.fundReceivers(
					receiver3
				);
				const receiver3Pending = await this.TokenReleaseScheduleLogic.getPendingAccumulatedFunds(
					receiver3
				);

				await this.TokenReleaseScheduleLogic.pause();

				//update max release rate
				await this.TokenReleaseScheduleLogic.updateTokenReleaseScheduleLogicParams(
					ether('200000'),
					finalReleaseRatePerPeriod,
					changePercentage,
					blocksPerPeriod,
					{
						from: owner
					}
				);

				const currentReleaseRatePerPeriodAfter =
					await this.TokenReleaseScheduleLogic.currentReleaseRatePerPeriod();
				const currentReleaseRatePerBlockAfter =
					await this.TokenReleaseScheduleLogic.currentReleaseRatePerBlock();
				const finalReleaseRatePerPeriodAfter =
					await this.TokenReleaseScheduleLogic.finalReleaseRatePerPeriod();
				const changePercentageAfter = await this.TokenReleaseScheduleLogic.changePercentage();
				const blocksPerPeriodAfter = await this.TokenReleaseScheduleLogic.blocksPerPeriod();
				const startBlockAfter = await this.TokenReleaseScheduleLogic.startBlock();
				currentBlock = await this.BlockData.getBlock();

				const currentReleaseRateAfter =
					await this.TokenReleaseScheduleLogic.getCurrentReleaseRate();

				const receiver1DetailsAfter = await this.TokenReleaseScheduleLogic.fundReceivers(receiver1);
				const receiver1PendingAfter =
					await this.TokenReleaseScheduleLogic.getPendingAccumulatedFunds(receiver1);

				const receiver2DetailsAfter = await this.TokenReleaseScheduleLogic.fundReceivers(receiver2);
				const receiver2PendingAfter =
					await this.TokenReleaseScheduleLogic.getPendingAccumulatedFunds(receiver2);

				const receiver3DetailsAfter = await this.TokenReleaseScheduleLogic.fundReceivers(receiver3);
				const receiver3PendingAfter =
					await this.TokenReleaseScheduleLogic.getPendingAccumulatedFunds(receiver3);

				const receiver1Share = getReceiverShare(
					currentReleaseRatePerBlock,
					new BN('8000'),
					new BN('10000'),
					new BN('2')
				);

				const receiver2Share = getReceiverShare(
					currentReleaseRatePerBlock,
					new BN('1000'),
					new BN('10000'),
					new BN('2')
				);

				const receiver3Share = getReceiverShare(
					currentReleaseRatePerBlock,
					new BN('1000'),
					new BN('10000'),
					new BN('2')
				);

				expect(receiver1DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(
					receiver1DetailsBefore.totalAccumulatedFunds
						.add(receiver1Pending)
						.add(receiver1Share)
						.add(new BN('1'))
				);

				expect(receiver2DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(
					receiver2DetailsBefore.totalAccumulatedFunds
						.add(receiver2Pending)
						.add(receiver2Share)
						.add(new BN('1'))
				);

				expect(receiver3DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(
					receiver3DetailsBefore.totalAccumulatedFunds
						.add(receiver3Pending)
						.add(receiver3Share)
						.add(new BN('1'))
				);

				expect(receiver1PendingAfter).to.bignumber.be.eq(new BN('0'));
				expect(receiver2PendingAfter).to.bignumber.be.eq(new BN('0'));
				expect(receiver3PendingAfter).to.bignumber.be.eq(new BN('0'));

				expect(currentReleaserateBefore._currentReleaseRatePerPeriod).to.bignumber.be.eq(
					currentReleaseRatePerPeriod
				);
				expect(currentReleaseRateAfter._currentReleaseRatePerPeriod).to.bignumber.be.eq(
					currentReleaseRatePerPeriodAfter
				);

				expect(currentReleaserateBefore._currentReleaseRatePerBlock).to.bignumber.be.eq(
					currentReleaseRatePerBlock
				);
				expect(currentReleaseRateAfter._currentReleaseRatePerBlock).to.bignumber.be.eq(
					currentReleaseRatePerBlockAfter
				);

				expect(currentReleaserateBefore.blockNumber).to.bignumber.be.gt(new BN('0'));
				expect(currentReleaseRateAfter.blockNumber).to.bignumber.be.eq(currentBlock);

				expect(currentReleaseRatePerPeriodAfter).to.bignumber.be.eq(ether('200000'));
				expect(finalReleaseRatePerPeriodAfter).to.bignumber.be.eq(finalReleaseRatePerPeriod);
				expect(changePercentageAfter).to.bignumber.be.eq(changePercentage);
				expect(blocksPerPeriodAfter).to.bignumber.be.eq(blocksPerPeriod);
				expect(startBlockAfter).to.bignumber.be.eq(currentBlock);
			});

			it('should revert when owner tries to update the currentReleaseRatePerPeriod with already set value', async () => {
				await expectRevert(
					this.TokenReleaseScheduleLogic.updateTokenReleaseScheduleLogicParams(
						ether('200000'),
						finalReleaseRatePerPeriod,
						changePercentage,
						blocksPerPeriod,
						{
							from: owner
						}
					),
					'TokenReleaseScheduleLogic: ALREADY_SET'
				);
			});
		});

		describe('update finalReleaseRatePerPeriod', () => {
			it('should update the finalReleaseRatePerPeriod correctly', async () => {
				// increase blocks
				const currentBlock1 = await this.BlockData.getBlock();
				await time.advanceBlockTo(currentBlock1.add(new BN('5')));

				currentReleaseRatePerPeriod =
					await this.TokenReleaseScheduleLogic.currentReleaseRatePerPeriod();
				currentReleaseRatePerBlock =
					await this.TokenReleaseScheduleLogic.currentReleaseRatePerBlock();
				finalReleaseRatePerPeriod =
					await this.TokenReleaseScheduleLogic.finalReleaseRatePerPeriod();
				changePercentage = await this.TokenReleaseScheduleLogic.changePercentage();
				blocksPerPeriod = await this.TokenReleaseScheduleLogic.blocksPerPeriod();
				startBlock = await this.TokenReleaseScheduleLogic.startBlock();

				const currentReleaserateBefore =
					await this.TokenReleaseScheduleLogic.getCurrentReleaseRate();

				const receiver1DetailsBefore = await this.TokenReleaseScheduleLogic.fundReceivers(
					receiver1
				);
				const receiver1Pending = await this.TokenReleaseScheduleLogic.getPendingAccumulatedFunds(
					receiver1
				);

				const receiver2DetailsBefore = await this.TokenReleaseScheduleLogic.fundReceivers(
					receiver2
				);
				const receiver2Pending = await this.TokenReleaseScheduleLogic.getPendingAccumulatedFunds(
					receiver2
				);

				const receiver3DetailsBefore = await this.TokenReleaseScheduleLogic.fundReceivers(
					receiver3
				);
				const receiver3Pending = await this.TokenReleaseScheduleLogic.getPendingAccumulatedFunds(
					receiver3
				);

				//update max release rate
				await this.TokenReleaseScheduleLogic.updateTokenReleaseScheduleLogicParams(
					currentReleaseRatePerPeriod,
					ether('10000000'),
					changePercentage,
					blocksPerPeriod,
					{
						from: owner
					}
				);

				const currentReleaseRatePerPeriodAfter =
					await this.TokenReleaseScheduleLogic.currentReleaseRatePerPeriod();
				const currentReleaseRatePerBlockAfter =
					await this.TokenReleaseScheduleLogic.currentReleaseRatePerBlock();
				const finalReleaseRatePerPeriodAfter =
					await this.TokenReleaseScheduleLogic.finalReleaseRatePerPeriod();
				const changePercentageAfter = await this.TokenReleaseScheduleLogic.changePercentage();
				const blocksPerPeriodAfter = await this.TokenReleaseScheduleLogic.blocksPerPeriod();
				const startBlockAfter = await this.TokenReleaseScheduleLogic.startBlock();
				currentBlock = await this.BlockData.getBlock();

				const currentReleaseRateAfter =
					await this.TokenReleaseScheduleLogic.getCurrentReleaseRate();

				const receiver1DetailsAfter = await this.TokenReleaseScheduleLogic.fundReceivers(receiver1);
				const receiver1PendingAfter =
					await this.TokenReleaseScheduleLogic.getPendingAccumulatedFunds(receiver1);

				const receiver2DetailsAfter = await this.TokenReleaseScheduleLogic.fundReceivers(receiver2);
				const receiver2PendingAfter =
					await this.TokenReleaseScheduleLogic.getPendingAccumulatedFunds(receiver2);

				const receiver3DetailsAfter = await this.TokenReleaseScheduleLogic.fundReceivers(receiver3);
				const receiver3PendingAfter =
					await this.TokenReleaseScheduleLogic.getPendingAccumulatedFunds(receiver3);

				const receiver1Share = getReceiverShare(
					currentReleaseRatePerBlock,
					new BN('8000'),
					new BN('10000'),
					new BN('1')
				);

				const receiver2Share = getReceiverShare(
					currentReleaseRatePerBlock,
					new BN('1000'),
					new BN('10000'),
					new BN('1')
				);

				const receiver3Share = getReceiverShare(
					currentReleaseRatePerBlock,
					new BN('1000'),
					new BN('10000'),
					new BN('1')
				);

				expect(receiver1DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(
					receiver1DetailsBefore.totalAccumulatedFunds
						.add(receiver1Pending)
						.add(receiver1Share)
						.add(new BN('1'))
				);

				expect(receiver2DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(
					receiver2DetailsBefore.totalAccumulatedFunds
						.add(receiver2Pending)
						.add(receiver2Share)
						.add(new BN('1'))
				);

				expect(receiver3DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(
					receiver3DetailsBefore.totalAccumulatedFunds
						.add(receiver3Pending)
						.add(receiver3Share)
						.add(new BN('1'))
				);

				expect(receiver1PendingAfter).to.bignumber.be.eq(new BN('0'));
				expect(receiver2PendingAfter).to.bignumber.be.eq(new BN('0'));
				expect(receiver3PendingAfter).to.bignumber.be.eq(new BN('0'));

				expect(currentReleaserateBefore._currentReleaseRatePerPeriod).to.bignumber.be.eq(
					currentReleaseRatePerPeriod
				);
				expect(currentReleaseRateAfter._currentReleaseRatePerPeriod).to.bignumber.be.eq(
					currentReleaseRatePerPeriodAfter
				);

				expect(currentReleaserateBefore._currentReleaseRatePerBlock).to.bignumber.be.eq(
					currentReleaseRatePerBlock
				);
				expect(currentReleaseRateAfter._currentReleaseRatePerBlock).to.bignumber.be.eq(
					currentReleaseRatePerBlockAfter
				);

				expect(currentReleaseRatePerPeriodAfter).to.bignumber.be.eq(currentReleaseRatePerPeriod);
				expect(finalReleaseRatePerPeriodAfter).to.bignumber.be.eq(ether('10000000'));
				expect(changePercentageAfter).to.bignumber.be.eq(changePercentage);
				expect(blocksPerPeriodAfter).to.bignumber.be.eq(blocksPerPeriod);
				expect(startBlockAfter).to.bignumber.be.eq(currentBlock);
			});

			it('should revert when owner tries to update the finalReleaseRatePerPeriod with already set value', async () => {
				await expectRevert(
					this.TokenReleaseScheduleLogic.updateTokenReleaseScheduleLogicParams(
						currentReleaseRatePerPeriod,
						ether('10000000'),
						changePercentage,
						blocksPerPeriod,
						{
							from: owner
						}
					),
					'TokenReleaseScheduleLogic: ALREADY_SET'
				);
			});
		});

		describe('update changePercentage', () => {
			it('should update the changePercentage correctly', async () => {
				currentReleaseRatePerPeriod =
					await this.TokenReleaseScheduleLogic.currentReleaseRatePerPeriod();
				finalReleaseRatePerPeriod =
					await this.TokenReleaseScheduleLogic.finalReleaseRatePerPeriod();
				changePercentage = await this.TokenReleaseScheduleLogic.changePercentage();
				blocksPerPeriod = await this.TokenReleaseScheduleLogic.blocksPerPeriod();
				startBlock = await this.TokenReleaseScheduleLogic.startBlock();

				//update max release rate
				await this.TokenReleaseScheduleLogic.updateTokenReleaseScheduleLogicParams(
					currentReleaseRatePerPeriod,
					finalReleaseRatePerPeriod,
					1000,
					blocksPerPeriod,
					{
						from: owner
					}
				);

				const currentReleaseRatePerPeriodAfter =
					await this.TokenReleaseScheduleLogic.currentReleaseRatePerPeriod();
				const finalReleaseRatePerPeriodAfter =
					await this.TokenReleaseScheduleLogic.finalReleaseRatePerPeriod();
				const changePercentageAfter = await this.TokenReleaseScheduleLogic.changePercentage();
				const blocksPerPeriodAfter = await this.TokenReleaseScheduleLogic.blocksPerPeriod();
				const startBlockAfter = await this.TokenReleaseScheduleLogic.startBlock();
				currentBlock = await this.BlockData.getBlock();

				expect(currentReleaseRatePerPeriodAfter).to.bignumber.be.eq(currentReleaseRatePerPeriod);
				expect(finalReleaseRatePerPeriodAfter).to.bignumber.be.eq(finalReleaseRatePerPeriod);
				expect(changePercentageAfter).to.bignumber.be.eq(new BN('1000'));
				expect(blocksPerPeriodAfter).to.bignumber.be.eq(blocksPerPeriod);
				expect(startBlockAfter).to.bignumber.be.eq(currentBlock);
			});

			it('should revert when owner tries to update the changePercentage with already set value', async () => {
				await expectRevert(
					this.TokenReleaseScheduleLogic.updateTokenReleaseScheduleLogicParams(
						currentReleaseRatePerPeriod,
						finalReleaseRatePerPeriod,
						1000,
						blocksPerPeriod,
						{
							from: owner
						}
					),
					'TokenReleaseScheduleLogic: ALREADY_SET'
				);
			});
		});

		describe('update blocksPerPeriod', () => {
			it('should update the blocksPerPeriod correctly', async () => {
				currentReleaseRatePerPeriod =
					await this.TokenReleaseScheduleLogic.currentReleaseRatePerPeriod();
				finalReleaseRatePerPeriod =
					await this.TokenReleaseScheduleLogic.finalReleaseRatePerPeriod();
				changePercentage = await this.TokenReleaseScheduleLogic.changePercentage();
				blocksPerPeriod = await this.TokenReleaseScheduleLogic.blocksPerPeriod();
				startBlock = await this.TokenReleaseScheduleLogic.startBlock();

				//update max release rate
				await this.TokenReleaseScheduleLogic.updateTokenReleaseScheduleLogicParams(
					currentReleaseRatePerPeriod,
					finalReleaseRatePerPeriod,
					changePercentage,
					Number(time.duration.hours('2')) / 3,
					{
						from: owner
					}
				);

				const currentReleaseRatePerPeriodAfter =
					await this.TokenReleaseScheduleLogic.currentReleaseRatePerPeriod();
				const finalReleaseRatePerPeriodAfter =
					await this.TokenReleaseScheduleLogic.finalReleaseRatePerPeriod();
				const changePercentageAfter = await this.TokenReleaseScheduleLogic.changePercentage();
				const blocksPerPeriodAfter = await this.TokenReleaseScheduleLogic.blocksPerPeriod();
				const startBlockAfter = await this.TokenReleaseScheduleLogic.startBlock();
				currentBlock = await this.BlockData.getBlock();

				expect(currentReleaseRatePerPeriodAfter).to.bignumber.be.eq(currentReleaseRatePerPeriod);
				expect(finalReleaseRatePerPeriodAfter).to.bignumber.be.eq(finalReleaseRatePerPeriod);
				expect(changePercentageAfter).to.bignumber.be.eq(new BN('1000'));
				expect(blocksPerPeriodAfter).to.bignumber.be.eq(
					new BN(Number(time.duration.hours('2')) / 3)
				);
				expect(startBlockAfter).to.bignumber.be.eq(currentBlock);
			});

			it('should revert when owner tries to update the blocksPerPeriod with already set value', async () => {
				await expectRevert(
					this.TokenReleaseScheduleLogic.updateTokenReleaseScheduleLogicParams(
						currentReleaseRatePerPeriod,
						finalReleaseRatePerPeriod,
						changePercentage,
						Number(time.duration.hours('2')) / 3,
						{
							from: owner
						}
					),
					'TokenReleaseScheduleLogic: ALREADY_SET'
				);
			});
		});

		describe('update all logicContract params', () => {
			it('should update the all logicContract params correctly', async () => {
				startBlock = await this.TokenReleaseScheduleLogic.startBlock();

				//update max release rate
				await this.TokenReleaseScheduleLogic.updateTokenReleaseScheduleLogicParams(
					ether('100000'),
					ether('1000000'),
					new BN('500'),
					blocksPerPeriod,
					{
						from: owner
					}
				);

				const currentReleaseRatePerPeriodAfter =
					await this.TokenReleaseScheduleLogic.currentReleaseRatePerPeriod();
				const finalReleaseRatePerPeriodAfter =
					await this.TokenReleaseScheduleLogic.finalReleaseRatePerPeriod();
				const changePercentageAfter = await this.TokenReleaseScheduleLogic.changePercentage();
				const blocksPerPeriodAfter = await this.TokenReleaseScheduleLogic.blocksPerPeriod();
				blocksPerPeriod = await this.TokenReleaseScheduleLogic.blocksPerPeriod();
				const startBlockAfter = await this.TokenReleaseScheduleLogic.startBlock();
				currentBlock = await this.BlockData.getBlock();

				expect(currentReleaseRatePerPeriodAfter).to.bignumber.be.eq(ether('100000'));
				expect(finalReleaseRatePerPeriodAfter).to.bignumber.be.eq(ether('1000000'));
				expect(changePercentageAfter).to.bignumber.be.eq(new BN('500'));
				expect(blocksPerPeriodAfter).to.bignumber.be.eq(new BN(blocksPerPeriod.toString()));
				expect(startBlockAfter).to.bignumber.be.eq(currentBlock);
			});

			it('should revert when owner tries to update the all the params with already set value', async () => {
				await expectRevert(
					this.TokenReleaseScheduleLogic.updateTokenReleaseScheduleLogicParams(
						ether('100000'),
						ether('1000000'),
						500,
						blocksPerPeriod,
						{
							from: owner
						}
					),
					'TokenReleaseScheduleLogic: ALREADY_SET'
				);
			});

			it('should revert when non-owner tries to update the currentReleaseRatePerPeriod', async () => {
				await expectRevert(
					this.TokenReleaseScheduleLogic.updateTokenReleaseScheduleLogicParams(
						ether('100000'),
						ether('1000000'),
						500,
						blocksPerPeriod,
						{
							from: user1
						}
					),
					'TokenReleaseScheduleLogic: ONLY_ADMIN_CAN_CALL'
				);
			});

			it('should revert when owner tries to update the logicContract params', async () => {
				await expectRevert(
					this.TokenReleaseScheduleLogic.updateTokenReleaseScheduleLogicParams(
						ether('100000'),
						ether('1000000'),
						-500,
						blocksPerPeriod,
						{
							from: owner
						}
					),
					'TokenReleaseScheduleLogic: INVALID_RATES'
				);

				await expectRevert(
					this.TokenReleaseScheduleLogic.updateTokenReleaseScheduleLogicParams(
						ether('100000'),
						ether('10000'),
						500,
						blocksPerPeriod,
						{
							from: owner
						}
					),
					'TokenReleaseScheduleLogic: INVALID_RATES'
				);
			});

			it('should revert when owner tries to update the logicContract params with invalid change percentage', async () => {
				await expectRevert(
					this.TokenReleaseScheduleLogic.updateTokenReleaseScheduleLogicParams(
						ether('100000'),
						ether('1000'),
						-99,
						blocksPerPeriod,
						{
							from: owner
						}
					),
					'TokenReleaseScheduleLogic: INVALID_PERCENTAGE'
				);

				await expectRevert(
					this.TokenReleaseScheduleLogic.updateTokenReleaseScheduleLogicParams(
						ether('100000'),
						ether('1000'),
						-1,
						blocksPerPeriod,
						{
							from: owner
						}
					),
					'TokenReleaseScheduleLogic: INVALID_PERCENTAGE'
				);

				await expectRevert(
					this.TokenReleaseScheduleLogic.updateTokenReleaseScheduleLogicParams(
						ether('100000'),
						ether('100000000'),
						99,
						blocksPerPeriod,
						{
							from: owner
						}
					),
					'TokenReleaseScheduleLogic: INVALID_PERCENTAGE'
				);

				await expectRevert(
					this.TokenReleaseScheduleLogic.updateTokenReleaseScheduleLogicParams(
						ether('100000'),
						ether('100000000'),
						1,
						blocksPerPeriod,
						{
							from: owner
						}
					),
					'TokenReleaseScheduleLogic: INVALID_PERCENTAGE'
				);
			});

			it('should revert when owner tries to update the current params when contract is unpaused', async () => {
				await this.TokenReleaseScheduleLogic.unPause();
				await expectRevert(
					this.TokenReleaseScheduleLogic.updateTokenReleaseScheduleLogicParams(
						ether('100000'),
						ether('1000000'),
						500,
						blocksPerPeriod,
						{
							from: owner
						}
					),
					'Pausable: not paused'
				);
			});
		});
	});

	describe('claim()', () => {
		let currentNonce;
		let receiver1Pendings;
		let receiver2Pendings;
		let receiver3Pendings;
		let receiver1PendingsAfter;
		let receiver2PendingsAfter;
		let receiver3PendingsAfter;

		let receiver1Details;
		let receiver2Details;
		let receiver3Details;
		let receiver1DetailsAfter;
		let receiver2DetailsAfter;
		let receiver3DetailsAfter;
		let receiver1;
		let receiver2;
		let receiver3;
		before(async () => {
			const VAULT_KEEPER = await this.TokenReleaseScheduleLogic.VAULT_KEEPER();

			await this.TokenReleaseScheduleLogic.grantRole(VAULT_KEEPER, PUBLIC_ADDRESS);

			// get current nonce of user
			currentNonce = await this.TokenReleaseScheduleLogic.userNonce(user1);
			receiver1 = 1;
			receiver2 = 2;
			receiver3 = 4;
		});

		it('should allow user to claim', async () => {
			const receiver1Details = await this.TokenReleaseScheduleLogic.fundReceivers(1);
			const startBlock = await this.TokenReleaseScheduleLogic.startBlock();

			// transfer lac tokens to Vault
			await this.LacToken.transfer(
				this.TokenReleaseScheduleLogic.address,
				receiver1Details.totalAccumulatedFunds,
				{
					from: minter
				}
			);

			signature = await createSignature(
				this.pk,
				user1,
				receiver1Details.totalAccumulatedFunds,
				currentNonce,
				receiver1,
				5,
				this.TokenReleaseScheduleLogic.address,
				this.chainId,
				'TokenReleaseScheduleLogic'
			);

			const user1Bal = await this.LacToken.balanceOf(user1);

			//claim tokens
			await this.TokenReleaseScheduleLogic.claim(
				receiver1Details.totalAccumulatedFunds,
				receiver1,
				5,
				signature,
				{
					from: user1
				}
			);

			const user1BalAfter = await this.LacToken.balanceOf(user1);
			const nonceAfter = await this.TokenReleaseScheduleLogic.userNonce(user1);

			expect(currentNonce).to.bignumber.be.eq(new BN('0'));
			expect(nonceAfter).to.bignumber.be.eq(new BN('1'));
			expect(user1Bal).to.bignumber.be.eq(ether('1'));
			expect(user1BalAfter.sub(ether('1'))).to.bignumber.be.eq(
				receiver1Details.totalAccumulatedFunds
			);
		});

		it('should revert when user tries to claim more amount that receiver accumulated', async () => {
			// transfer lac tokens to Vault
			await this.LacToken.transfer(this.TokenReleaseScheduleLogic.address, ether('50000000'), {
				from: minter
			});

			//stash user1 lac tokens
			await this.LacToken.transfer(accounts[9], await this.LacToken.balanceOf(user1), {
				from: user1
			});
			const nonceAfter = await this.TokenReleaseScheduleLogic.userNonce(user1);

			signature = await createSignature(
				this.pk,
				user1,
				ether('1200000'),
				nonceAfter,
				receiver1,
				6,
				this.TokenReleaseScheduleLogic.address,
				this.chainId,
				'TokenReleaseScheduleLogic'
			);

			//claim tokens
			await expectRevert(
				this.TokenReleaseScheduleLogic.claim(ether('1200000'), receiver1, 6, signature, {
					from: user1
				}),
				'TokenReleaseScheduleLogic: INSUFFICIENT_AMOUNT'
			);
		});

		it('should revert when user tries to claim zero tokens', async () => {
			signature = await createSignature(
				this.pk,
				user1,
				ether('0'),
				currentNonce,
				receiver1,
				7,
				this.TokenReleaseScheduleLogic.address,
				this.chainId,
				'TokenReleaseScheduleLogic'
			);

			//claim tokens
			await expectRevert(
				this.TokenReleaseScheduleLogic.claim(ether('0'), receiver1, 7, signature, {
					from: user1
				}),
				'TokenReleaseScheduleLogic: INSUFFICIENT_AMOUNT'
			);
		});

		it('should revert when user tries to claim tokens from invalid receiver', async () => {
			signature = await createSignature(
				this.pk,
				user1,
				ether('1'),
				currentNonce,
				8,
				8,
				this.TokenReleaseScheduleLogic.address,
				this.chainId,
				'TokenReleaseScheduleLogic'
			);

			//claim tokens
			await expectRevert(
				this.TokenReleaseScheduleLogic.claim(ether('1'), 8, 8, signature, {
					from: user1
				}),
				'TokenReleaseScheduleLogic: RECEIVER_DOES_NOT_EXISTS'
			);
		});

		it('should revert when param value mismatches with signature value', async () => {
			signature = await createSignature(
				this.pk,
				user1,
				ether('2'),
				currentNonce,
				receiver1,
				9,
				this.TokenReleaseScheduleLogic.address,
				this.chainId,
				'TokenReleaseScheduleLogic'
			);

			//claim tokens
			await expectRevert(
				this.TokenReleaseScheduleLogic.claim(ether('0.1'), receiver1, 9, signature, {
					from: user1
				}),
				'TokenReleaseScheduleLogic: INVALID_SIGNATURE'
			);

			signature = await createSignature(
				this.pk,
				user2,
				ether('0.1'),
				currentNonce,
				receiver1,
				5,
				this.TokenReleaseScheduleLogic.address,
				this.chainId,
				'TokenReleaseScheduleLogic'
			);

			//claim tokens
			await expectRevert(
				this.TokenReleaseScheduleLogic.claim(ether('0.1'), receiver1, 5, signature, {
					from: user1
				}),
				'TokenReleaseScheduleLogic: INVALID_SIGNATURE'
			);

			signature = await createSignature(
				this.pk,
				user1,
				ether('0.1'),
				currentNonce,
				receiver2,
				6,
				this.TokenReleaseScheduleLogic.address,
				this.chainId,
				'TokenReleaseScheduleLogic'
			);

			//claim tokens
			await expectRevert(
				this.TokenReleaseScheduleLogic.claim(ether('0.1'), receiver1, 6, signature, {
					from: user1
				}),
				'TokenReleaseScheduleLogic: INVALID_SIGNATURE'
			);

			signature = await createSignature(
				this.pk,
				user1,
				ether('0.1'),
				currentNonce,
				receiver1,
				7,
				this.BlockData.address,
				this.chainId,
				'TokenReleaseScheduleLogic'
			);

			//claim tokens
			await expectRevert(
				this.TokenReleaseScheduleLogic.claim(ether('0.1'), receiver1, 7, signature, {
					from: user1
				}),
				'TokenReleaseScheduleLogic: INVALID_SIGNATURE'
			);

			signature = await createSignature(
				this.pk,
				user1,
				ether('0.1'),
				currentNonce,
				receiver1,
				8,
				this.TokenReleaseScheduleLogic.address,
				new BN('111'),
				'TokenReleaseScheduleLogic'
			);

			//claim tokens
			await expectRevert(
				this.TokenReleaseScheduleLogic.claim(ether('0.1'), receiver1, 8, signature, {
					from: user1
				}),
				'TokenReleaseScheduleLogic: INVALID_SIGNATURE'
			);

			signature = await createSignature(
				this.pk,
				user1,
				ether('0.1'),
				currentNonce,
				receiver1,
				8,
				this.TokenReleaseScheduleLogic.address,
				new BN('111'),
				'TokenReleaseScheduleLogic'
			);

			//claim tokens
			await expectRevert(
				this.TokenReleaseScheduleLogic.claim(ether('0.1'), receiver1, 9, signature, {
					from: user1
				}),
				'TokenReleaseScheduleLogic: INVALID_SIGNATURE'
			);
		});

		it('should revert when another user tries to reuse the signature', async () => {
			signature = await createSignature(
				this.pk,
				user1,
				ether('0.1'),
				currentNonce,
				receiver1,
				8,
				this.TokenReleaseScheduleLogic.address,
				this.chainId,
				'TokenReleaseScheduleLogic'
			);

			//claim tokens
			await expectRevert(
				this.TokenReleaseScheduleLogic.claim(ether('0.1'), receiver1, 8, signature, {
					from: user2
				}),
				'TokenReleaseScheduleLogic: INVALID_SIGNATURE'
			);
		});

		it('should revert when user tries to reuse the signature with old nonce value', async () => {
			signature = await createSignature(
				this.pk,
				user1,
				ether('0.1'),
				currentNonce,
				receiver1,
				9,
				this.TokenReleaseScheduleLogic.address,
				this.chainId,
				'TokenReleaseScheduleLogic'
			);

			//claim tokens
			await expectRevert(
				this.TokenReleaseScheduleLogic.claim(ether('0.1'), receiver1, 9, signature, {
					from: user1
				}),
				'TokenReleaseScheduleLogic: INVALID_SIGNATURE'
			);

			// should be able to claim with latest nonce
			currentNonce = await this.TokenReleaseScheduleLogic.userNonce(user1);

			signature = await createSignature(
				this.pk,
				user1,
				ether('0.2'),
				currentNonce,
				receiver1,
				3,
				this.TokenReleaseScheduleLogic.address,
				this.chainId,
				'TokenReleaseScheduleLogic'
			);

			//claim tokens
			await this.TokenReleaseScheduleLogic.claim(ether('0.2'), receiver1, 3, signature, {
				from: user1
			});

			const nonceAfter = await this.TokenReleaseScheduleLogic.userNonce(user1);
			expect(nonceAfter).to.bignumber.be.eq(new BN('2'));
		});

		it('it should update the allocated funds correctly', async () => {
			await claim(
				this.TokenReleaseScheduleLogic,
				user1,
				ether('1'),
				receiver1,
				this.pk,
				this.chainId,
				'TokenReleaseScheduleLogic'
			);

			const lastFundUpdatedBlock = await this.TokenReleaseScheduleLogic.lastFundUpdatedBlock();

			receiver1Details = await this.TokenReleaseScheduleLogic.fundReceivers(receiver1);
			receiver2Details = await this.TokenReleaseScheduleLogic.fundReceivers(receiver2);
			receiver3Details = await this.TokenReleaseScheduleLogic.fundReceivers(receiver3);

			const currentBlock = await this.BlockData.getBlock();

			//get total blocks after last update
			const totalBlocks = new BN(5);

			//increase time by 5 blocks,  per day = 28800 Number(57600)
			await time.advanceBlockTo(currentBlock.add(totalBlocks));

			receiver1Pendings = await this.TokenReleaseScheduleLogic.getPendingAccumulatedFunds(
				receiver1
			);
			receiver2Pendings = await this.TokenReleaseScheduleLogic.getPendingAccumulatedFunds(
				receiver2
			);
			receiver3Pendings = await this.TokenReleaseScheduleLogic.getPendingAccumulatedFunds(
				receiver3
			);

			//update allocated funds
			await claim(
				this.TokenReleaseScheduleLogic,
				user1,
				ether('1'),
				receiver1,
				this.pk,
				this.chainId,
				'TokenReleaseScheduleLogic'
			);

			const lastFundUpdatedBlockAfter = await this.TokenReleaseScheduleLogic.lastFundUpdatedBlock();

			receiver1PendingsAfter = await this.TokenReleaseScheduleLogic.getPendingAccumulatedFunds(
				receiver1
			);
			receiver2PendingsAfter = await this.TokenReleaseScheduleLogic.getPendingAccumulatedFunds(
				receiver2
			);
			receiver3PendingsAfter = await this.TokenReleaseScheduleLogic.getPendingAccumulatedFunds(
				receiver3
			);

			receiver1DetailsAfter = await this.TokenReleaseScheduleLogic.fundReceivers(receiver1);
			receiver2DetailsAfter = await this.TokenReleaseScheduleLogic.fundReceivers(receiver2);
			receiver3DetailsAfter = await this.TokenReleaseScheduleLogic.fundReceivers(receiver3);

			const receiver1Share = getReceiverShare(
				currentPerBlockAmount,
				receiver1Details.lacShare,
				new BN('10000'),
				totalBlocks
			);
			const receiver2Share = getReceiverShare(
				currentPerBlockAmount,
				receiver2Details.lacShare,
				new BN('10000'),
				totalBlocks
			);
			const receiver3Share = getReceiverShare(
				currentPerBlockAmount,
				receiver3Details.lacShare,
				new BN('10000'),
				totalBlocks
			);

			const receiver1PerBlockShare = getReceiverShare(
				currentPerBlockAmount,
				receiver1Details.lacShare,
				new BN('10000'),
				new BN('1')
			);
			const receiver2PerBlockShare = getReceiverShare(
				currentPerBlockAmount,
				receiver2Details.lacShare,
				new BN('10000'),
				new BN('1')
			);
			const receiver3PerBlockShare = getReceiverShare(
				currentPerBlockAmount,
				receiver3Details.lacShare,
				new BN('10000'),
				new BN('1')
			);

			expect(lastFundUpdatedBlock).to.bignumber.be.eq(currentBlock);

			expect(lastFundUpdatedBlockAfter).to.bignumber.be.eq(
				currentBlock.add(totalBlocks).add(new BN('1'))
			);

			expect(receiver1Pendings).to.bignumber.be.eq(receiver1Share);
			expect(receiver2Pendings).to.bignumber.be.eq(receiver2Share);
			expect(receiver3Pendings).to.bignumber.be.eq(receiver3Share);

			expect(receiver1Details.totalAccumulatedFunds).to.bignumber.be.gt(new BN('0'));
			expect(receiver2Details.totalAccumulatedFunds).to.bignumber.be.gt(new BN('0'));
			expect(receiver3Details.totalAccumulatedFunds).to.bignumber.be.gt(new BN('0'));

			expect(receiver1PendingsAfter).to.bignumber.be.eq(new BN('0'));
			expect(receiver2PendingsAfter).to.bignumber.be.eq(new BN('0'));
			expect(receiver3PendingsAfter).to.bignumber.be.eq(new BN('0'));

			expect(receiver1DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(
				receiver1Details.totalAccumulatedFunds
					.add(receiver1Pendings)
					.add(receiver1PerBlockShare)
					.sub(ether('1'))
			);
			expect(receiver2DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(
				receiver2Details.totalAccumulatedFunds.add(receiver2Pendings).add(receiver2PerBlockShare)
			);
			expect(receiver3DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(
				receiver3Details.totalAccumulatedFunds.add(receiver3Pendings).add(receiver3PerBlockShare)
			);
		});

		it('should update the release rates correctly once the period is completed', async () => {
			const currentReleaseRatePerPeriod =
				await this.TokenReleaseScheduleLogic.currentReleaseRatePerPeriod();
			const currentReleaseRatePerBlock =
				await this.TokenReleaseScheduleLogic.currentReleaseRatePerBlock();
			const startBlock = await this.TokenReleaseScheduleLogic.startBlock();
			const currentBlock = await this.BlockData.getBlock();
			const totalBlocks = new BN(time.duration.hours('2') / 3);

			console.log(
				'currentReleaseRatePerPeriod: ',
				weiToEth(currentReleaseRatePerPeriod).toString()
			);
			console.log('currentReleaseRatePerBlock: ', weiToEth(currentReleaseRatePerBlock).toString());

			console.log('currentBlock: ', currentBlock.toString());
			console.log('startBlock: ', startBlock.toString());

			const receiver1Details = await this.TokenReleaseScheduleLogic.fundReceivers(receiver1);
			const receiver2Details = await this.TokenReleaseScheduleLogic.fundReceivers(receiver2);
			const receiver3Details = await this.TokenReleaseScheduleLogic.fundReceivers(receiver3);

			console.log(
				'receiver1Details: ',
				weiToEth(receiver1Details.totalAccumulatedFunds).toString()
			);
			console.log(
				'receiver2Details: ',
				weiToEth(receiver2Details.totalAccumulatedFunds).toString()
			);
			console.log(
				'receiver3Details: ',
				weiToEth(receiver3Details.totalAccumulatedFunds).toString()
			);

			// increase by 1205 blocks
			// complete one period by increasing time. 3 hours are already passed
			await time.advanceBlockTo(currentBlock.add(totalBlocks).add(new BN('5')));

			// update allocated funds
			await claim(
				this.TokenReleaseScheduleLogic,
				user1,
				ether('1'),
				receiver1,
				this.pk,
				this.chainId,
				'TokenReleaseScheduleLogic'
			);

			// 1270 - 69 / 1200
			const currentReleaseRatePerPeriodAfter =
				await this.TokenReleaseScheduleLogic.currentReleaseRatePerPeriod();
			const currentReleaseRatePerBlockAfter =
				await this.TokenReleaseScheduleLogic.currentReleaseRatePerBlock();
			const startBlockAfter = await this.TokenReleaseScheduleLogic.startBlock();
			console.log('startBlockAfter: ', startBlockAfter.toString());

			const receiver1DetailsAfter = await this.TokenReleaseScheduleLogic.fundReceivers(receiver1);
			const receiver2DetailsAfter = await this.TokenReleaseScheduleLogic.fundReceivers(receiver2);
			const receiver3DetailsAfter = await this.TokenReleaseScheduleLogic.fundReceivers(receiver3);

			console.log(
				'receiver1DetailsAfter: ',
				weiToEth(receiver1DetailsAfter.totalAccumulatedFunds).toString()
			);
			console.log(
				'receiver2DetailsAfter: ',
				weiToEth(receiver2DetailsAfter.totalAccumulatedFunds).toString()
			);
			console.log(
				'receiver3DetailsAfter: ',
				weiToEth(receiver3DetailsAfter.totalAccumulatedFunds).toString()
			);

			// increase currentReleaseRatePerPeriod amount by this amount
			const increaseAmount = currentReleaseRatePerPeriod.mul(new BN('500')).div(new BN('10000'));

			expect(currentReleaseRatePerPeriod).to.bignumber.be.eq(ether('100000'));
			expect(currentReleaseRatePerBlock).to.bignumber.be.eq(
				currentReleaseRatePerPeriod.div(new BN(time.duration.hours('1').div(new BN('3'))))
			);
			expect(startBlock).to.bignumber.be.gt(new BN('0'));

			expect(currentReleaseRatePerPeriodAfter).to.bignumber.be.eq(ether('110250'));
			expect(currentReleaseRatePerBlockAfter).to.bignumber.be.eq(ether('91.875'));
		});

		it('should reach the maxReleaseRatePerWeek on time correctly', async () => {
			let currentReleaseRatePerPeriod =
				await this.TokenReleaseScheduleLogic.currentReleaseRatePerPeriod();
			let finalReleaseRatePerPeriod =
				await this.TokenReleaseScheduleLogic.finalReleaseRatePerPeriod();

			// 	let noOfWeeks = 0;
			// while (!currentReleaseRatePerPeriod.eq(finalReleaseRatePerPeriod)) {
			// 	await time.increase(time.duration.hours('1'));

			// 	// await updateAllocated funds
			// 	await this.TokenReleaseScheduleLogic.updateAllocatedFunds();

			// 	currentReleaseRatePerPeriod = await this.TokenReleaseScheduleLogic.currentReleaseRatePerPeriod();
			// 	finalReleaseRatePerPeriod = await this.TokenReleaseScheduleLogic.finalReleaseRatePerPeriod();

			// 	noOfWeeks++;
			// }
			// // 46 hours required to reach max release rate
			// console.log('Total no of hours: ', noOfWeeks.toString());

			const startBlock = await this.TokenReleaseScheduleLogic.startBlock();
			const currentBlock = await this.BlockData.getBlock();
			const totalBlocks = new BN(time.duration.hours('46') / 3);

			// increase time
			await time.advanceBlockTo(currentBlock.add(totalBlocks));
			// await updateAllocated funds
			await claim(
				this.TokenReleaseScheduleLogic,
				user1,
				ether('1'),
				receiver1,
				this.pk,
				this.chainId,
				'TokenReleaseScheduleLogic'
			);

			const currentReleaseRatePerPeriodAfter =
				await this.TokenReleaseScheduleLogic.currentReleaseRatePerPeriod();
			const finalReleaseRatePerPeriodAfter =
				await this.TokenReleaseScheduleLogic.finalReleaseRatePerPeriod();

			const currentReleaseRatePerBlock =
				await this.TokenReleaseScheduleLogic.currentReleaseRatePerBlock();

			const startBlockAfter = await this.TokenReleaseScheduleLogic.startBlock();

			expect(startBlockAfter).to.bignumber.be.eq(
				startBlock.add(new BN(time.duration.hours('46') / 3)).add(new BN('1'))
			);

			expect(currentReleaseRatePerPeriodAfter).to.bignumber.be.eq(finalReleaseRatePerPeriodAfter);
			expect(finalReleaseRatePerPeriodAfter).to.bignumber.be.eq(ether('1000000'));
			expect(currentReleaseRatePerBlock).to.bignumber.be.eq(
				finalReleaseRatePerPeriodAfter.div(new BN(time.duration.hours('1') / 3))
			);
		});

		it('should not increase the currentReleaseRatePerPeriod after maxReleaRatePerWeek reaches', async () => {
			const currentReleaseRatePerPeriod =
				await this.TokenReleaseScheduleLogic.currentReleaseRatePerPeriod();
			const finalReleaseRatePerPeriod =
				await this.TokenReleaseScheduleLogic.finalReleaseRatePerPeriod();
			const currentReleaseRatePerBlock =
				await this.TokenReleaseScheduleLogic.currentReleaseRatePerBlock();

			const currentBlock = await this.BlockData.getBlock();
			const totalBlocks = new BN(time.duration.hours('1') / 3);

			// increase time
			await time.advanceBlockTo(currentBlock.add(totalBlocks));

			// update accumulated funds
			await claim(
				this.TokenReleaseScheduleLogic,
				user1,
				ether('1'),
				receiver1,
				this.pk,
				this.chainId,
				'TokenReleaseScheduleLogic'
			);

			const currentReleaseRatePerPeriodAfter =
				await this.TokenReleaseScheduleLogic.currentReleaseRatePerPeriod();
			const finalReleaseRatePerPeriodAfter =
				await this.TokenReleaseScheduleLogic.finalReleaseRatePerPeriod();
			const currentReleaseRatePerBlockAfter =
				await this.TokenReleaseScheduleLogic.currentReleaseRatePerBlock();

			expect(currentReleaseRatePerPeriod).to.bignumber.be.eq(currentReleaseRatePerPeriodAfter);
			expect(finalReleaseRatePerPeriod).to.bignumber.be.eq(finalReleaseRatePerPeriodAfter);
			expect(currentReleaseRatePerBlock).to.bignumber.be.eq(currentReleaseRatePerBlockAfter);
		});

		it('should revert when user tries to claim when contract is paused', async () => {
			// unpause contract
			await this.TokenReleaseScheduleLogic.pause();

			signature = await createSignature(
				this.pk,
				user1,
				ether('0.1'),
				currentNonce,
				receiver1,
				8,
				this.TokenReleaseScheduleLogic.address,
				new BN('111'),
				'TokenReleaseScheduleLogic'
			);

			await expectRevert(
				this.TokenReleaseScheduleLogic.claim(ether('0.1'), receiver1, 8, signature, {
					from: user1
				}),
				'Pausable: paused'
			);
		});
	});

	describe('claimAllTokens()', () => {
		it('should claim tokens send to logicContract contract', async () => {
			//transfer tokens to Vault
			await this.SampleToken.mint(this.TokenReleaseScheduleLogic.address, ether('5'), {
				from: owner
			});

			const logicContractTokenBalBefore = await this.SampleToken.balanceOf(
				this.TokenReleaseScheduleLogic.address
			);
			const owenerTokenBalBefore = await this.SampleToken.balanceOf(owner);

			// claim all tokens
			await this.TokenReleaseScheduleLogic.claimAllTokens(owner, this.SampleToken.address, {
				from: owner
			});

			const logicContractTokenBalAfter = await this.SampleToken.balanceOf(
				this.TokenReleaseScheduleLogic.address
			);
			const owenerTokenBalAfter = await this.SampleToken.balanceOf(owner);

			expect(logicContractTokenBalBefore).to.bignumber.be.eq(ether('5'));
			expect(owenerTokenBalBefore).to.bignumber.be.eq(ether('5'));

			expect(logicContractTokenBalAfter).to.bignumber.be.eq(new BN('0'));
			expect(owenerTokenBalAfter).to.bignumber.be.eq(owenerTokenBalBefore.add(ether('5')));
		});

		it('should revert when non-admin tries to claim all the tokens', async () => {
			await expectRevert(
				this.TokenReleaseScheduleLogic.claimAllTokens(owner, this.SampleToken.address, {
					from: minter
				}),
				'TokenReleaseScheduleLogic: ONLY_ADMIN_CAN_CALL'
			);
		});

		it('should revert when admin tries to claim all the tokens to zero user address', async () => {
			await expectRevert(
				this.TokenReleaseScheduleLogic.claimAllTokens(ZERO_ADDRESS, this.SampleToken.address, {
					from: owner
				}),
				'TokenReleaseScheduleLogic: INVALID_USER_ADDRESS'
			);
		});
		it('should revert when admin tries to claim all the tokens for zero token address', async () => {
			await expectRevert(
				this.TokenReleaseScheduleLogic.claimAllTokens(owner, ZERO_ADDRESS, {from: owner}),
				'TokenReleaseScheduleLogic: INVALID_TOKEN_ADDRESS'
			);
		});
		it('should revert when admin tries to claim all the tokens for LAC token address', async () => {
			await expectRevert(
				this.TokenReleaseScheduleLogic.claimAllTokens(owner, this.LacToken.address, {from: owner}),
				'TokenReleaseScheduleLogic: INVALID_TOKEN_ADDRESS'
			);
		});
	});

	describe('claimTokens()', () => {
		it('should claim specified amount of tokens send to Vault contract', async () => {
			//transfer tokens to Vault
			await this.SampleToken.mint(this.TokenReleaseScheduleLogic.address, ether('5'), {
				from: owner
			});

			const logicContractTokenBalBefore = await this.SampleToken.balanceOf(
				this.TokenReleaseScheduleLogic.address
			);
			const minterTokenBalBefore = await this.SampleToken.balanceOf(minter);

			// claim all tokens
			await this.TokenReleaseScheduleLogic.claimTokens(
				minter,
				this.SampleToken.address,
				ether('4'),
				{
					from: owner
				}
			);

			const logicContractTokenBalAfter = await this.SampleToken.balanceOf(
				this.TokenReleaseScheduleLogic.address
			);
			const minterTokenBalAfter = await this.SampleToken.balanceOf(minter);

			expect(logicContractTokenBalBefore).to.bignumber.be.eq(ether('5'));

			expect(logicContractTokenBalAfter).to.bignumber.be.eq(ether('1'));
			expect(minterTokenBalAfter).to.bignumber.be.eq(minterTokenBalBefore.add(ether('4')));
		});

		it('should revert when non-admin tries to claim given no. of the tokens', async () => {
			await expectRevert(
				this.TokenReleaseScheduleLogic.claimTokens(owner, this.SampleToken.address, ether('4'), {
					from: minter
				}),
				'TokenReleaseScheduleLogic: ONLY_ADMIN_CAN_CALL'
			);
		});

		it('should revert when admin tries to claim  given no. of the tokens to zero user address', async () => {
			await expectRevert(
				this.TokenReleaseScheduleLogic.claimTokens(
					ZERO_ADDRESS,
					this.SampleToken.address,
					ether('4'),
					{
						from: owner
					}
				),
				'TokenReleaseScheduleLogic: INVALID_USER_ADDRESS'
			);
		});

		it('should revert when admin tries to claim  given no. of the tokens for zero token address', async () => {
			await expectRevert(
				this.TokenReleaseScheduleLogic.claimTokens(owner, ZERO_ADDRESS, ether('4'), {from: owner}),
				'TokenReleaseScheduleLogic: INVALID_TOKEN_ADDRESS'
			);
		});

		it('should revert when admin tries to claim  given no. of the tokens for LAC token address', async () => {
			await expectRevert(
				this.TokenReleaseScheduleLogic.claimTokens(owner, this.LacToken.address, ether('4'), {
					from: owner
				}),
				'TokenReleaseScheduleLogic: INVALID_TOKEN_ADDRESS'
			);
		});

		it('should revert when admin tries to claim invalid amount of tokens', async () => {
			await expectRevert(
				this.TokenReleaseScheduleLogic.claimTokens(owner, this.SampleToken.address, ether('0'), {
					from: owner
				}),
				'TokenReleaseScheduleLogic: INSUFFICIENT_BALANCE'
			);
			await expectRevert(
				this.TokenReleaseScheduleLogic.claimTokens(owner, this.SampleToken.address, ether('2'), {
					from: owner
				}),
				'TokenReleaseScheduleLogic: INSUFFICIENT_BALANCE'
			);
		});
	});

	describe('getTotalFundReceivers()', () => {
		it('should return total fund receivers correctly', async () => {
			const totalReceivers = await this.TokenReleaseScheduleLogic.getTotalFundReceivers();
			expect(totalReceivers).to.bignumber.be.eq(new BN('3'));
		});
	});

	describe('getFundReceiverShare()', () => {
		it('should return fund receivers share correctly', async () => {
			const receiver1Share = await this.TokenReleaseScheduleLogic.getFundReceiverShare(1);
			const receiver2Share = await this.TokenReleaseScheduleLogic.getFundReceiverShare(2);
			const receiver3Share = await this.TokenReleaseScheduleLogic.getFundReceiverShare(4);
			expect(receiver1Share).to.bignumber.be.eq(new BN('800000000000'));
			expect(receiver2Share).to.bignumber.be.eq(new BN('100000000000'));
			expect(receiver3Share).to.bignumber.be.eq(new BN('100000000000'));
		});
	});

	describe('getPendingAccumulatedFunds()', () => {
		it('should get the pending accumulated funds correctly', async () => {
			await this.TokenReleaseScheduleLogic.unPause();

			//update allocated funds
			await claim(
				this.TokenReleaseScheduleLogic,
				user1,
				ether('1'),
				1,
				this.pk,
				this.chainId,
				'TokenReleaseScheduleLogic'
			);

			const currentPerBlockAmount =
				await this.TokenReleaseScheduleLogic.currentReleaseRatePerBlock();

			const receiver1Share = getReceiverShare(
				currentPerBlockAmount,
				new BN('8000'),
				new BN('10000'),
				new BN('1')
			);
			const receiver2Share = getReceiverShare(
				currentPerBlockAmount,
				new BN('1000'),
				new BN('10000'),
				new BN('1')
			);
			const receiver3Share = getReceiverShare(
				currentPerBlockAmount,
				new BN('1000'),
				new BN('10000'),
				new BN('1')
			);

			const currentBlock = await this.BlockData.getBlock();
			await time.advanceBlockTo(currentBlock.add(new BN('1')));

			//get pending accumulated funds
			const pendingFunds1 = await this.TokenReleaseScheduleLogic.getPendingAccumulatedFunds(1);
			const pendingFunds2 = await this.TokenReleaseScheduleLogic.getPendingAccumulatedFunds(2);
			const pendingFunds3 = await this.TokenReleaseScheduleLogic.getPendingAccumulatedFunds(4);

			expect(pendingFunds1).to.bignumber.be.eq(new BN('0'));
			expect(pendingFunds2).to.bignumber.be.eq(new BN('0'));
			expect(pendingFunds3).to.bignumber.be.eq(new BN('0'));
		});
	});

	describe('blocksPassedSinceUpdate()', async () => {
		it('should get the multiplier correctly', async () => {
			const multiplier = await this.TokenReleaseScheduleLogic.blocksPassedSinceUpdate();

			const currentBlock = await this.BlockData.getBlock();
			const lastFundUpdatedBlock = await this.TokenReleaseScheduleLogic.lastFundUpdatedBlock();

			// increase time by 6 seconds
			await time.advanceBlockTo(currentBlock.add(new BN('2')));

			const multiplierAfter = await this.TokenReleaseScheduleLogic.blocksPassedSinceUpdate();

			expect(currentBlock).to.bignumber.be.eq(lastFundUpdatedBlock.add(new BN('1')));
			expect(multiplier).to.bignumber.be.eq(new BN('1'));
			expect(multiplierAfter).to.bignumber.be.eq(new BN('3'));
		});
	});

	describe('getCurrentReleaseRate() inclining', () => {
		let VaultInstance;
		before('', async () => {
			// deploy Vault
			VaultInstance = await TokenReleaseScheduleLogic.new(
				this.Vault.address,
				this.LacToken.address,
				ether('100000'),
				ether('1000000'),
				500, // 5%
				blocksPerPeriod // 1 hours = 1200 blocks
			);

			// add fund receiver1 and receiver2
			await VaultInstance.setup(['receiver1'], [9000], {from: owner});
		});

		it('should return the current release rate correctly', async () => {
			const lacTokenAddress = await VaultInstance.Token();
			const startBlock = await VaultInstance.startBlock();
			const currentReleaseRatePerPeriod = await VaultInstance.currentReleaseRatePerPeriod();
			const currentReleaseRatePerBlock = await VaultInstance.currentReleaseRatePerBlock();
			const finalReleaseRatePerPeriod = await VaultInstance.finalReleaseRatePerPeriod();
			const changePercentage = await VaultInstance.changePercentage();
			const lastFundUpdatedBlock = await VaultInstance.lastFundUpdatedBlock();
			const blocksPerPeriod = await VaultInstance.blocksPerPeriod();
			const currentRleaseRate = await VaultInstance.getCurrentReleaseRate();

			expect(lacTokenAddress).to.be.eq(this.LacToken.address);

			//expect(startBlock).to.bignumber.be.eq(new BN('0'));
			expect(currentReleaseRatePerPeriod).to.bignumber.be.eq(ether('100000'));
			expect(currentReleaseRatePerBlock).to.bignumber.be.eq(new BN('83333333333333333333'));
			expect(currentRleaseRate._currentReleaseRatePerPeriod).to.bignumber.be.eq(ether('100000'));
			expect(currentRleaseRate._currentReleaseRatePerBlock).to.bignumber.be.eq(
				new BN('83333333333333333333')
			);
			expect(finalReleaseRatePerPeriod).to.bignumber.be.eq(ether('1000000'));
			expect(changePercentage).to.bignumber.be.eq(new BN('500'));
			expect(lastFundUpdatedBlock).to.bignumber.be.eq(startBlock);
			expect(blocksPerPeriod).to.bignumber.be.eq(
				new BN(Number(time.duration.hours(1).toString()) / 3)
			);
		});

		it('should return the current release rate correctly without updating the release rate', async () => {
			const currentBlock = await this.BlockData.getBlock();

			await time.advanceBlockTo(currentBlock.add(new BN(blocksPerPeriod)).add(new BN('1')));

			const currentReleaseRatePerPeriod = await VaultInstance.currentReleaseRatePerPeriod();
			const currentReleaseRatePerBlock = await VaultInstance.currentReleaseRatePerBlock();

			const currentRleaseRate = await VaultInstance.getCurrentReleaseRate();

			expect(currentReleaseRatePerPeriod).to.bignumber.be.eq(ether('100000'));
			expect(currentReleaseRatePerBlock).to.bignumber.be.eq(new BN('83333333333333333333'));
			expect(currentRleaseRate._currentReleaseRatePerPeriod).to.bignumber.be.eq(ether('105000'));
			expect(currentRleaseRate._currentReleaseRatePerBlock).to.bignumber.be.eq(
				new BN('87500000000000000000')
			);
		});

		it('should return the current release rate correctly when max release rate reaches', async () => {
			const currentBlock = await this.BlockData.getBlock();
			const totalBlocks = new BN(time.duration.hours('48') / 3);

			await time.advanceBlockTo(currentBlock.add(totalBlocks));

			const currentReleaseRatePerPeriod = await VaultInstance.currentReleaseRatePerPeriod();
			const currentReleaseRatePerBlock = await VaultInstance.currentReleaseRatePerBlock();

			const currentRleaseRate = await VaultInstance.getCurrentReleaseRate();

			expect(currentReleaseRatePerPeriod).to.bignumber.be.eq(ether('100000'));
			expect(currentReleaseRatePerBlock).to.bignumber.be.eq(new BN('83333333333333333333'));
			expect(currentRleaseRate._currentReleaseRatePerPeriod).to.bignumber.be.eq(ether('1000000'));
			expect(currentRleaseRate._currentReleaseRatePerBlock).to.bignumber.be.eq(
				new BN('833333333333333333333')
			);
		});
	});

	describe('getCurrentReleaseRate() declining', () => {
		let VaultInstance;
		before('', async () => {
			// deploy Vault
			VaultInstance = await TokenReleaseScheduleLogic.new(
				this.Vault.address,
				this.LacToken.address,
				ether('100000'),
				ether('10000'),
				-500, // -5%
				blocksPerPeriod // 1 hours = 1200 blocks
			);
		});

		it('should return the current release rate correctly', async () => {
			const lacTokenAddress = await VaultInstance.Token();
			const startBlock = await VaultInstance.startBlock();
			const currentReleaseRatePerPeriod = await VaultInstance.currentReleaseRatePerPeriod();
			const currentReleaseRatePerBlock = await VaultInstance.currentReleaseRatePerBlock();
			const finalReleaseRatePerPeriod = await VaultInstance.finalReleaseRatePerPeriod();
			const changePercentage = await VaultInstance.changePercentage();
			const lastFundUpdatedBlock = await VaultInstance.lastFundUpdatedBlock();
			const blocksPerPeriod = await VaultInstance.blocksPerPeriod();
			const currentRleaseRate = await VaultInstance.getCurrentReleaseRate();

			expect(lacTokenAddress).to.be.eq(this.LacToken.address);

			expect(startBlock).to.bignumber.be.eq(new BN('0'));
			expect(currentReleaseRatePerPeriod).to.bignumber.be.eq(ether('100000'));
			expect(currentReleaseRatePerBlock).to.bignumber.be.eq(new BN('83333333333333333333'));
			expect(currentRleaseRate._currentReleaseRatePerPeriod).to.bignumber.be.eq(ether('100000'));
			expect(currentRleaseRate._currentReleaseRatePerBlock).to.bignumber.be.eq(
				new BN('83333333333333333333')
			);
			expect(finalReleaseRatePerPeriod).to.bignumber.be.eq(ether('10000'));
			expect(changePercentage).to.bignumber.be.eq(new BN('-500'));
			expect(lastFundUpdatedBlock).to.bignumber.be.eq(startBlock);
			expect(blocksPerPeriod).to.bignumber.be.eq(
				new BN(Number(time.duration.hours(1).toString()) / 3)
			);
		});

		it('should return the current release rate correctly without updating the release rate', async () => {
			const currentBlock = await this.BlockData.getBlock();

			await time.advanceBlockTo(currentBlock.add(new BN(blocksPerPeriod)).add(new BN('1')));

			const currentReleaseRatePerPeriod = await VaultInstance.currentReleaseRatePerPeriod();
			const currentReleaseRatePerBlock = await VaultInstance.currentReleaseRatePerBlock();

			const currentRleaseRate = await VaultInstance.getCurrentReleaseRate();

			expect(currentReleaseRatePerPeriod).to.bignumber.be.eq(ether('100000'));
			expect(currentReleaseRatePerBlock).to.bignumber.be.eq(new BN('83333333333333333333'));
			expect(currentRleaseRate._currentReleaseRatePerPeriod).to.bignumber.be.eq(ether('95000'));
			expect(currentRleaseRate._currentReleaseRatePerBlock).to.bignumber.be.eq(
				new BN('79166666666666666666')
			);
		});

		it('should return the current release rate correctly when max release rate reaches', async () => {
			const currentBlock = await this.BlockData.getBlock();
			const totalBlocks = new BN(time.duration.hours('48') / 3);

			await time.advanceBlockTo(currentBlock.add(totalBlocks));

			const currentReleaseRatePerPeriod = await VaultInstance.currentReleaseRatePerPeriod();
			const currentReleaseRatePerBlock = await VaultInstance.currentReleaseRatePerBlock();

			const currentRleaseRate = await VaultInstance.getCurrentReleaseRate();

			expect(currentReleaseRatePerPeriod).to.bignumber.be.eq(ether('100000'));
			expect(currentReleaseRatePerBlock).to.bignumber.be.eq(new BN('83333333333333333333'));
			expect(currentRleaseRate._currentReleaseRatePerPeriod).to.bignumber.be.eq(ether('10000'));
			expect(currentRleaseRate._currentReleaseRatePerBlock).to.bignumber.be.eq(
				new BN('8333333333333333333')
			);
		});
	});
});
