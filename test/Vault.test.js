require('chai').should();

const Web3 = require('web3');
const {expect} = require('chai');
const {expectRevert, BN, ether, time} = require('@openzeppelin/test-helpers');
const {deployProxy, upgradeProxy} = require('@openzeppelin/truffle-upgrades');
const {ZERO_ADDRESS} = require('@openzeppelin/test-helpers/src/constants');
const {PRIVATE_KEY} = require('../secrets.test.json');
const {signTypedData_v4} = require('eth-sig-util');

const LacToken = artifacts.require('LacToken');
const Vault = artifacts.require('Vault');
const BlockData = artifacts.require('BlockData');
const SampleToken = artifacts.require('SampleToken');

const name = 'Vault';
const version = '1.0.0';

function getReceiverShare(perBlockAmount, receiverShare, totalShare, totalBlocks) {
	return perBlockAmount.mul(totalBlocks).mul(receiverShare).div(totalShare);
}

async function createSignature(
	pk,
	userAddress,
	claimAmount,
	nonceValue,
	receiverAddress,
	contractAddress,
	chainId
) {
	const typedMessage = {
		data: {
			types: {
				EIP712Domain: [
					{name: 'name', type: 'string'},
					{name: 'version', type: 'string'},
					{name: 'chainId', type: 'uint256'},
					{name: 'verifyingContract', type: 'address'}
				],
				Claim: [
					{name: 'account', type: 'address'},
					{name: 'amount', type: 'uint256'},
					{name: 'receiver', type: 'address'},
					{name: 'nonce', type: 'uint256'}
				]
			},
			domain: {
				name,
				version,
				chainId,
				verifyingContract: contractAddress
			},
			primaryType: 'Claim',
			message: {
				account: userAddress,
				amount: claimAmount,
				receiver: receiverAddress,
				nonce: nonceValue
			}
		}
	};

	signature = await signTypedData_v4(pk, typedMessage);
	return signature;
}

contract('Vault', (accounts) => {
	const owner = accounts[0];
	const minter = accounts[1];
	const user1 = accounts[2];
	const user2 = accounts[3];
	const user3 = accounts[4];
	const receiver1 = accounts[5];
	const receiver2 = accounts[6];
	const receiver3 = accounts[7];

	let currentPerBlockAmount;
	before('deploy contract', async () => {
		// deploy LAC token
		this.LacToken = await LacToken.new('Lacucina Token', 'LAC', minter, ether('500000000'));

		// deploy Sample token
		this.SampleToken = await SampleToken.new();

		// deploy Vault
		this.Vault = await deployProxy(Vault, [
			'Vault',
			'1.0.0',
			this.LacToken.address,
			ether('100000'),
			ether('1000000'),
			500, // 5%
			time.duration.weeks(1) // 1 weeks
		]);

		this.web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8555'));

		// add account
		await this.web3.eth.accounts.wallet.add('0x' + PRIVATE_KEY);
		this.pk = Buffer.from(PRIVATE_KEY, 'hex');

		this.BlockData = await BlockData.new();
		this.chainId = await this.BlockData.getChainId();
	});

	describe('initialize()', () => {
		it('should initialize vault correctly', async () => {
			const lacTokenAddress = await this.Vault.LacToken();
			const sartTime = await this.Vault.startTime();
			const currentReleaseRatePerPeriod = await this.Vault.currentReleaseRatePerPeriod();
			const currentReleaseRatePerBlock = await this.Vault.currentReleaseRatePerBlock();
			const maxReleaseRatePerPeriod = await this.Vault.maxReleaseRatePerPeriod();
			const increasePercentage = await this.Vault.increasePercentage();
			const increaseRateAfterPeriods = await this.Vault.increaseRateAfterPeriods();
			const lastFundUpdatedTimestamp = await this.Vault.lastFundUpdatedTimestamp();
			expect(lacTokenAddress).to.be.eq(this.LacToken.address);

			expect(sartTime).to.bignumber.be.gt(new BN('0'));
			expect(currentReleaseRatePerPeriod).to.bignumber.be.eq(ether('100000'));
			expect(currentReleaseRatePerBlock).to.bignumber.be.eq(new BN('496031746031746031'));
			expect(maxReleaseRatePerPeriod).to.bignumber.be.eq(ether('1000000'));
			expect(increasePercentage).to.bignumber.be.eq(new BN('500'));
			expect(increaseRateAfterPeriods).to.bignumber.be.eq(new BN(time.duration.weeks('1')));
			expect(lastFundUpdatedTimestamp).to.bignumber.be.eq(sartTime);

			currentPerBlockAmount = currentReleaseRatePerBlock;
		});
	});

	describe('addFundReceiverAddress()', () => {
		before('add fundReceiver', async () => {
			// add fund receiver1
			await this.Vault.addFundReceiverAddress(receiver1, 9000, {from: owner});
			await this.Vault.addFundReceiverAddress(receiver2, 1000, {from: owner});
		});

		it('should add fund receivers correctly', async () => {
			const fundReceiver1 = await this.Vault.fundReceiversList(0);
			const fundReceiver2 = await this.Vault.fundReceiversList(1);

			const fundReceiver1Details = await this.Vault.fundReceivers(receiver1);
			const fundReceiver2Details = await this.Vault.fundReceivers(receiver2);

			const receiver1Share = await this.Vault.getFundReceiverShare(receiver1);
			const receiver2Share = await this.Vault.getFundReceiverShare(receiver2);
			const totalShares = await this.Vault.totalShares();
			const totalReceivers = await this.Vault.getTotalFundReceivers();

			expect(fundReceiver1).to.be.eq(receiver1);
			expect(fundReceiver2).to.be.eq(receiver2);

			expect(fundReceiver1Details.lacShare).to.bignumber.be.eq(new BN('9000'));
			expect(fundReceiver1Details.totalAccumulatedFunds).to.bignumber.be.eq(
				new BN('496031746031746031')
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
				this.Vault.addFundReceiverAddress(receiver3, 1000, {from: minter}),
				'Vault: ONLY_ADMIN_CAN_CALL'
			);
		});

		it('should revert when admin tries to add the zero address as fund receiver', async () => {
			await expectRevert(
				this.Vault.addFundReceiverAddress(ZERO_ADDRESS, 1000, {from: owner}),
				'LacTokenUtils: CANNOT_ADD_ZERO_ADDRESS'
			);
		});

		it('should revert when admin tries to add the already existing fund receiver', async () => {
			await expectRevert(
				this.Vault.addFundReceiverAddress(receiver1, 1000, {from: owner}),
				'LacTokenUtils: ADDRESS_ALREADY_EXISTS'
			);
		});

		it('should allocate funds correctly when new receiver is added', async () => {
			//update allocated funds
			await this.Vault.updateAllocatedFunds();

			//increase time by 2 days
			await time.increase(time.duration.days('2'));

			const fundReceiver1Details = await this.Vault.fundReceivers(receiver1);
			const fundReceiver2Details = await this.Vault.fundReceivers(receiver2);

			const receiver1Pendings = await this.Vault.getPendingAccumulatedFunds(receiver1);
			const receiver2Pendings = await this.Vault.getPendingAccumulatedFunds(receiver2);

			// // add third fund receiver
			await this.Vault.shrinkReceiver(receiver1, receiver3, 1000, {from: owner});

			const receiver1PendingsAfter = await this.Vault.getPendingAccumulatedFunds(receiver1);
			const receiver2PendingsAfter = await this.Vault.getPendingAccumulatedFunds(receiver2);

			const fundReceiver1DetailsAfter = await this.Vault.fundReceivers(receiver1);
			const fundReceiver2DetailsAfter = await this.Vault.fundReceivers(receiver2);
			const fundReceiver3DetailsAfter = await this.Vault.fundReceivers(receiver3);

			const totalShares = await this.Vault.totalShares();

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

			expect(fundReceiver1DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(
				fundReceiver1Details.totalAccumulatedFunds.add(receiver1Pendings)
			);

			expect(fundReceiver2DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(
				fundReceiver2Details.totalAccumulatedFunds.add(receiver2Pendings)
			);

			expect(fundReceiver3DetailsAfter.lacShare).to.bignumber.be.eq(new BN('1000'));
			expect(fundReceiver3DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(new BN('0'));

			expect(receiver1PendingsAfter).to.bignumber.be.eq(receiver1Share);

			expect(receiver2PendingsAfter).to.bignumber.be.eq(new BN('49603174603174603'));
			expect(receiver2PendingsAfter).to.bignumber.be.eq(receiver2Share);

			expect(totalShares).to.bignumber.be.eq(new BN('10000'));
		});
	});

	describe('removeFundReceiverAddress()', () => {
		let totalRecieversBefore;
		let receiver1Pendings;
		let receiver2Pendings;
		let receiver3Pendings;
		let fundReceiver1Details;
		let fundReceiver2Details;
		let fundReceiver3Details;

		before('remove fund receiver', async () => {
			//update allocated funds
			await this.Vault.updateAllocatedFunds();

			fundReceiver1Details = await this.Vault.fundReceivers(receiver1);
			fundReceiver2Details = await this.Vault.fundReceivers(receiver2);
			fundReceiver3Details = await this.Vault.fundReceivers(receiver3);

			receiver1Pendings = await this.Vault.getPendingAccumulatedFunds(receiver1);
			receiver2Pendings = await this.Vault.getPendingAccumulatedFunds(receiver2);
			receiver3Pendings = await this.Vault.getPendingAccumulatedFunds(receiver3);

			totalRecieversBefore = await this.Vault.getTotalFundReceivers();

			// remove receiver3
			await this.Vault.removeFundReceiverAddress(receiver3, {from: owner});
		});

		it('should remove the fundReceiver correctly', async () => {
			const totalReceivers = await this.Vault.getTotalFundReceivers();
			const totalShare = await this.Vault.totalShares();

			const fundReceiver1DetailsAfter = await this.Vault.fundReceivers(receiver1);
			const fundReceiver2DetailsAfter = await this.Vault.fundReceivers(receiver2);
			const fundReceiver3DetailsAfter = await this.Vault.fundReceivers(receiver3);

			expect(totalRecieversBefore).to.bignumber.be.eq(new BN('3'));
			expect(totalReceivers).to.bignumber.be.eq(new BN('2'));
			expect(totalShare).to.bignumber.be.eq(new BN('9000'));

			expect(fundReceiver1DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(
				fundReceiver1Details.totalAccumulatedFunds.add(receiver1Pendings)
			);

			expect(fundReceiver2DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(
				fundReceiver2Details.totalAccumulatedFunds.add(receiver2Pendings)
			);
			expect(fundReceiver3DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(new BN('0'));
			expect(fundReceiver3DetailsAfter.lacShare).to.bignumber.be.eq(new BN('0'));

			const receiver1Share = getReceiverShare(
				currentPerBlockAmount,
				fundReceiver1DetailsAfter.lacShare,
				new BN('9000'),
				new BN('1')
			);
			const receiver2Share = getReceiverShare(
				currentPerBlockAmount,
				new BN('1000'),
				new BN('9000'),
				new BN('1')
			);
			const receiver3hare = getReceiverShare(
				currentPerBlockAmount,
				new BN('1000'),
				new BN('10000'),
				new BN('1')
			);

			//update allocated funds
			await this.Vault.updateAllocatedFunds();

			const receiver1PendingsAfter = await this.Vault.getPendingAccumulatedFunds(receiver1);
			const receiver2PendingsAfter = await this.Vault.getPendingAccumulatedFunds(receiver2);

			expect(receiver3Pendings).to.bignumber.be.eq(receiver3hare);
			expect(fundReceiver1DetailsAfter.lacShare).to.bignumber.be.eq(new BN('8000'));
			const perBlock = await this.Vault.currentReleaseRatePerBlock();

			console.log('perBlock: ', perBlock.toString());
			console.log('receiver1PendingsAfter: ', receiver1PendingsAfter.toString());
			console.log('receiver1PendingsAfter: ', receiver2PendingsAfter.toString());

			/**************************************************************************** */
			// // difference of 496033
			// expect(perBlock).to.bignumber.be.eq(receiver1PendingsAfter.add(receiver2PendingsAfter));

			// expect(receiver1PendingsAfter).to.bignumber.be.eq(receiver1Share);
			// expect(receiver2PendingsAfter).to.bignumber.be.eq(receiver2Share);
		});

		it('should revert when non-admin tries remove the fund receiver address', async () => {
			await expectRevert(
				this.Vault.removeFundReceiverAddress(receiver3, {from: minter}),
				'Vault: ONLY_ADMIN_CAN_CALL'
			);
		});

		it('should revert when admin tries remove the fund receiver address which already removed', async () => {
			await expectRevert(
				this.Vault.removeFundReceiverAddress(receiver3, {from: owner}),
				'LacTokenUtils: ITEM_DOES_NOT_EXISTS'
			);
		});
	});

	describe('updateReceiverShare()', () => {
		let receiver1DetailsBefore;
		let receiver1DetailsAfter;
		let totalSharesBefore;
		let totalSharesAfter;

		it('should decrease the receiver`s share correctly', async () => {
			receiver1DetailsBefore = await this.Vault.fundReceivers(receiver1);
			totalSharesBefore = await this.Vault.totalShares();

			// update receiver1` share
			await this.Vault.updateReceiverShare(receiver1, new BN('7000'), {from: owner});

			receiver1DetailsAfter = await this.Vault.fundReceivers(receiver1);
			totalSharesAfter = await this.Vault.totalShares();

			expect(receiver1DetailsBefore.lacShare).to.bignumber.be.eq(new BN('8000'));
			expect(receiver1DetailsAfter.lacShare).to.bignumber.be.eq(new BN('7000'));
			expect(totalSharesBefore).to.bignumber.be.eq(new BN('9000'));
			expect(totalSharesAfter).to.bignumber.be.eq(new BN('8000'));
		});

		it('should increase the receiver`s share correctly', async () => {
			receiver1DetailsBefore = await this.Vault.fundReceivers(receiver1);
			totalSharesBefore = await this.Vault.totalShares();

			// update receiver1` share
			await this.Vault.updateReceiverShare(receiver1, new BN('9000'), {from: owner});

			receiver1DetailsAfter = await this.Vault.fundReceivers(receiver1);
			totalSharesAfter = await this.Vault.totalShares();

			expect(receiver1DetailsBefore.lacShare).to.bignumber.be.eq(new BN('7000'));
			expect(receiver1DetailsAfter.lacShare).to.bignumber.be.eq(new BN('9000'));
			expect(totalSharesBefore).to.bignumber.be.eq(new BN('8000'));
			expect(totalSharesAfter).to.bignumber.be.eq(new BN('10000'));
		});

		it('should revert when non-owner tries to update the fundreceiver`s share', async () => {
			await expectRevert(
				this.Vault.updateReceiverShare(receiver1, new BN('7000'), {from: minter}),
				'Vault: ONLY_ADMIN_CAN_CALL'
			);
		});
		it('should revert when owner tries to update the fundreceiver`s share with already set value', async () => {
			await expectRevert(
				this.Vault.updateReceiverShare(receiver1, new BN('9000'), {from: owner}),
				'Vault: INVALID_SHARE'
			);
			await expectRevert(
				this.Vault.updateReceiverShare(receiver1, new BN('0'), {from: owner}),
				'Vault: INVALID_SHARE'
			);
		});

		it('should revert when owner tries to update the non-existant fundreceiver`s share', async () => {
			await expectRevert(
				this.Vault.updateReceiverShare(receiver3, new BN('7000'), {from: owner}),
				'Vault: RECEIVER_DOES_NOT_EXISTS'
			);
		});
	});

	describe('shrinkReceiver()', () => {
		let receiver1DetailsBefore;
		let receiver1DetailsAfter;
		let receiver3DetailsBefore;
		let receiver3DetailsAfter;
		let totalSharesBefore;
		let totalSharesAfter;
		it('should shrink receiver correctly', async () => {
			receiver1DetailsBefore = await this.Vault.fundReceivers(receiver1);
			receiver3DetailsBefore = await this.Vault.fundReceivers(receiver3);
			totalSharesBefore = await this.Vault.totalShares();

			// shrink receiver
			await this.Vault.shrinkReceiver(receiver1, receiver3, new BN('1000'), {from: owner});

			receiver1DetailsAfter = await this.Vault.fundReceivers(receiver1);
			receiver3DetailsAfter = await this.Vault.fundReceivers(receiver3);
			totalSharesAfter = await this.Vault.totalShares();

			const totalReceivers = await this.Vault.getTotalFundReceivers();

			expect(totalReceivers).to.bignumber.be.eq(new BN('3'));
			expect(receiver1DetailsBefore.lacShare).to.bignumber.be.eq(new BN('9000'));
			expect(receiver1DetailsAfter.lacShare).to.bignumber.be.eq(new BN('8000'));
			expect(receiver3DetailsBefore.lacShare).to.bignumber.be.eq(new BN('0'));
			expect(receiver3DetailsAfter.lacShare).to.bignumber.be.eq(new BN('1000'));

			expect(totalSharesBefore).to.bignumber.be.eq(new BN('10000'));
			expect(totalSharesAfter).to.bignumber.be.eq(new BN('10000'));
		});

		it('should revert when non-owner tries to shrink fund receiver', async () => {
			await expectRevert(
				this.Vault.shrinkReceiver(receiver1, receiver3, new BN('1000'), {from: user1}),
				'Vault: ONLY_ADMIN_CAN_CALL'
			);
		});

		it('should revert when owner tries to shrink non-existing receiver', async () => {
			await expectRevert(
				this.Vault.shrinkReceiver(minter, receiver3, new BN('1000'), {from: owner}),
				'Vault: RECEIVER_DOES_NOT_EXISTS'
			);
		});

		it('should revert when owner tries to shrink existing receiver with invalid share', async () => {
			await expectRevert(
				this.Vault.shrinkReceiver(receiver1, receiver3, new BN('10000'), {from: owner}),
				'Vault: INVALID_SHARE'
			);
			await expectRevert(
				this.Vault.shrinkReceiver(receiver1, receiver3, new BN('8000'), {from: owner}),
				'Vault: INVALID_SHARE'
			);
			await expectRevert(
				this.Vault.shrinkReceiver(receiver1, receiver3, new BN('0'), {from: owner}),
				'Vault: INVALID_SHARE'
			);
		});

		it('should revert when owner tries to shrink receiver to add already existing receiver', async () => {
			await expectRevert(
				this.Vault.shrinkReceiver(receiver1, receiver3, new BN('5000'), {from: owner}),
				'LacTokenUtils: ADDRESS_ALREADY_EXISTS'
			);
		});

		it('should revert when owner tries to shrink receiver to add zero address as receiver', async () => {
			await expectRevert(
				this.Vault.shrinkReceiver(receiver1, ZERO_ADDRESS, new BN('5000'), {from: owner}),
				'LacTokenUtils: CANNOT_ADD_ZERO_ADDRESS'
			);
		});
	});

	describe('claim()', () => {
		let currentNonce;
		before(async () => {
			const OPERATOR_ROLE = await this.Vault.OPERATOR_ROLE();
			await this.Vault.grantRole(OPERATOR_ROLE, receiver1);
			await this.Vault.grantRole(OPERATOR_ROLE, receiver2);
			await this.Vault.grantRole(OPERATOR_ROLE, receiver3);

			await this.Vault.grantRole(OPERATOR_ROLE, '0x0055f67515c252860fe9b27f6903d44fcfc3a727');

			// get current nonce of user
			currentNonce = await this.Vault.userNonce(user1);
		});

		it('should allow user to claim', async () => {
			const receiver1Details = await this.Vault.fundReceivers(receiver1);

			// transfer lac tokens to Vault
			await this.LacToken.transfer(this.Vault.address, receiver1Details.totalAccumulatedFunds, {
				from: minter
			});

			signature = await createSignature(
				this.pk,
				user1,
				receiver1Details.totalAccumulatedFunds,
				currentNonce,
				receiver1,
				this.Vault.address,
				this.chainId
			);

			const user1Bal = await this.LacToken.balanceOf(user1);

			//claim tokens
			await this.Vault.claim(receiver1Details.totalAccumulatedFunds, receiver1, signature, {
				from: user1
			});

			const receiver1Share = getReceiverShare(
				currentPerBlockAmount,
				new BN('8000'),
				new BN('10000'),
				new BN('1')
			);

			const user1BalAfter = await this.LacToken.balanceOf(user1);
			const receiver1DetailsAfter = await this.Vault.fundReceivers(receiver1);
			const nonceAfter = await this.Vault.userNonce(user1);

			expect(currentNonce).to.bignumber.be.eq(new BN('0'));
			expect(nonceAfter).to.bignumber.be.eq(new BN('1'));
			expect(user1Bal).to.bignumber.be.eq(new BN('0'));
			expect(user1BalAfter).to.bignumber.be.eq(receiver1Details.totalAccumulatedFunds);
			expect(receiver1DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(receiver1Share);
		});

		it('should revert when user tries to claim more amount that receiver accumulated', async () => {
			// update allocated funds
			await this.Vault.updateAllocatedFunds();

			// transfer lac tokens to Vault
			await this.LacToken.transfer(this.Vault.address, ether('50000000'), {
				from: minter
			});

			//stash user1 lac tokens
			await this.LacToken.transfer(accounts[9], await this.LacToken.balanceOf(user1), {
				from: user1
			});

			signature = await createSignature(
				this.pk,
				user1,
				ether('5'),
				currentNonce,
				receiver1,
				this.Vault.address,
				this.chainId
			);

			//claim tokens
			await expectRevert(
				this.Vault.claim(ether('5'), receiver1, signature, {
					from: user1
				}),
				'Vault: INSUFFICIENT_AMOUNT'
			);
		});

		it('should revert when user tries to claim zero tokens', async () => {
			signature = await createSignature(
				this.pk,
				user1,
				ether('0'),
				currentNonce,
				receiver1,
				this.Vault.address,
				this.chainId
			);

			//claim tokens
			await expectRevert(
				this.Vault.claim(ether('0'), receiver1, signature, {
					from: user1
				}),
				'Vault: INSUFFICIENT_AMOUNT'
			);
		});

		it('should revert when user tries to claim tokens from invalid receiver', async () => {
			signature = await createSignature(
				this.pk,
				user1,
				ether('1'),
				currentNonce,
				user2,
				this.Vault.address,
				this.chainId
			);

			//claim tokens
			await expectRevert(
				this.Vault.claim(ether('1'), user2, signature, {
					from: user1
				}),
				'Vault: RECEIVER_DOES_NOT_EXISTS'
			);
		});

		it('should revert when param value mismatches with signature value', async () => {
			signature = await createSignature(
				this.pk,
				user1,
				ether('2'),
				currentNonce,
				receiver1,
				this.Vault.address,
				this.chainId
			);

			//claim tokens
			await expectRevert(
				this.Vault.claim(ether('0.1'), receiver1, signature, {
					from: user1
				}),
				'Vault: INVALID_SIGNATURE'
			);

			signature = await createSignature(
				this.pk,
				user2,
				ether('0.1'),
				currentNonce,
				receiver1,
				this.Vault.address,
				this.chainId
			);

			//claim tokens
			await expectRevert(
				this.Vault.claim(ether('0.1'), receiver1, signature, {
					from: user1
				}),
				'Vault: INVALID_SIGNATURE'
			);

			signature = await createSignature(
				this.pk,
				user1,
				ether('0.1'),
				currentNonce,
				receiver2,
				this.Vault.address,
				this.chainId
			);

			//claim tokens
			await expectRevert(
				this.Vault.claim(ether('0.1'), receiver1, signature, {
					from: user1
				}),
				'Vault: INVALID_SIGNATURE'
			);

			signature = await createSignature(
				this.pk,
				user1,
				ether('0.1'),
				currentNonce,
				receiver1,
				this.BlockData.address,
				this.chainId
			);

			//claim tokens
			await expectRevert(
				this.Vault.claim(ether('0.1'), receiver1, signature, {
					from: user1
				}),
				'Vault: INVALID_SIGNATURE'
			);

			signature = await createSignature(
				this.pk,
				user1,
				ether('0.1'),
				currentNonce,
				receiver1,
				this.Vault.address,
				new BN('111')
			);

			//claim tokens
			await expectRevert(
				this.Vault.claim(ether('0.1'), receiver1, signature, {
					from: user1
				}),
				'Vault: INVALID_SIGNATURE'
			);
		});

		it('should revert when another user tries to reuse the signature', async () => {
			signature = await createSignature(
				this.pk,
				user1,
				ether('0.1'),
				currentNonce,
				receiver1,
				this.Vault.address,
				this.chainId
			);

			//claim tokens
			await expectRevert(
				this.Vault.claim(ether('0.1'), receiver1, signature, {
					from: user2
				}),
				'Vault: INVALID_SIGNATURE'
			);
		});

		it('should revert when user tries to reuse the signature with old nonce value', async () => {
			signature = await createSignature(
				this.pk,
				user1,
				ether('0.1'),
				currentNonce,
				receiver1,
				this.Vault.address,
				this.chainId
			);

			//claim tokens
			await expectRevert(
				this.Vault.claim(ether('0.1'), receiver1, signature, {
					from: user1
				}),
				'Vault: INVALID_SIGNATURE'
			);

			// should be able to claim with latest nonce
			currentNonce = await this.Vault.userNonce(user1);

			signature = await createSignature(
				this.pk,
				user1,
				ether('0.2'),
				currentNonce,
				receiver1,
				this.Vault.address,
				this.chainId
			);

			//claim tokens
			await this.Vault.claim(ether('0.2'), receiver1, signature, {
				from: user1
			});

			const nonceAfter = await this.Vault.userNonce(user1);
			expect(nonceAfter).to.bignumber.be.eq(new BN('2'));
		});
	});

	describe('updateAllocatedFunds()', () => {
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
		it('it should update the allocated funds correctly', async () => {
			//update allocated funds
			await this.Vault.updateAllocatedFunds();

			receiver1Details = await this.Vault.fundReceivers(receiver1);
			receiver2Details = await this.Vault.fundReceivers(receiver2);
			receiver3Details = await this.Vault.fundReceivers(receiver3);

			//increase time by 1 day
			await time.increase(time.duration.days('1'));

			receiver1Pendings = await this.Vault.getPendingAccumulatedFunds(receiver1);
			receiver2Pendings = await this.Vault.getPendingAccumulatedFunds(receiver2);
			receiver3Pendings = await this.Vault.getPendingAccumulatedFunds(receiver3);

			const lastFundUpdatedTimestamp = await this.Vault.lastFundUpdatedTimestamp();

			//update allocated funds
			await this.Vault.updateAllocatedFunds();

			const lastFundUpdatedTimestampAfter = await this.Vault.lastFundUpdatedTimestamp();

			receiver1PendingsAfter = await this.Vault.getPendingAccumulatedFunds(receiver1);
			receiver2PendingsAfter = await this.Vault.getPendingAccumulatedFunds(receiver2);
			receiver3PendingsAfter = await this.Vault.getPendingAccumulatedFunds(receiver3);

			receiver1DetailsAfter = await this.Vault.fundReceivers(receiver1);
			receiver2DetailsAfter = await this.Vault.fundReceivers(receiver2);
			receiver3DetailsAfter = await this.Vault.fundReceivers(receiver3);

			//get total blocks after last update
			const totalBlocks = new BN(new BN(time.duration.days('1')).div(new BN('3')));

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

			const receiver1ShareAfter = getReceiverShare(
				currentPerBlockAmount,
				receiver1Details.lacShare,
				new BN('10000'),
				new BN('1')
			);
			const receiver2ShareAfter = getReceiverShare(
				currentPerBlockAmount,
				receiver2Details.lacShare,
				new BN('10000'),
				new BN('1')
			);
			const receiver3ShareAfter = getReceiverShare(
				currentPerBlockAmount,
				receiver3Details.lacShare,
				new BN('10000'),
				new BN('1')
			);

			expect(lastFundUpdatedTimestampAfter.sub(lastFundUpdatedTimestamp)).to.bignumber.be.eq(
				new BN(time.duration.days('1'))
			);

			expect(receiver1Pendings).to.bignumber.be.eq(receiver1Share);
			expect(receiver2Pendings).to.bignumber.be.eq(receiver2Share);
			expect(receiver3Pendings).to.bignumber.be.eq(receiver3Share);

			expect(receiver1Details.totalAccumulatedFunds).to.bignumber.be.gt(new BN('0'));
			expect(receiver2Details.totalAccumulatedFunds).to.bignumber.be.gt(new BN('0'));
			expect(receiver3Details.totalAccumulatedFunds).to.bignumber.be.gt(new BN('0'));

			expect(receiver1PendingsAfter).to.bignumber.be.eq(receiver1ShareAfter);
			expect(receiver2PendingsAfter).to.bignumber.be.eq(receiver2ShareAfter);
			expect(receiver3PendingsAfter).to.bignumber.be.eq(receiver3ShareAfter);

			expect(receiver1DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(
				receiver1Details.totalAccumulatedFunds.add(receiver1Pendings)
			);
			expect(receiver2DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(
				receiver2Details.totalAccumulatedFunds.add(receiver2Pendings)
			);
			expect(receiver3DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(
				receiver3Details.totalAccumulatedFunds.add(receiver3Pendings)
			);
		});

		it('should update the release rates correctly once the period is completed', async () => {
			const currentReleaseRatePerPeriod = await this.Vault.currentReleaseRatePerPeriod();
			const currentReleaseRatePerBlock = await this.Vault.currentReleaseRatePerBlock();
			const startTime = await this.Vault.startTime();

			// complete one period by increasing time. 3 days are already passed
			await time.increase(time.duration.days('6'));

			// update allocated funds
			await this.Vault.updateAllocatedFunds();

			const currentReleaseRatePerPeriodAfter = await this.Vault.currentReleaseRatePerPeriod();
			const currentReleaseRatePerBlockAfter = await this.Vault.currentReleaseRatePerBlock();
			const startTimeAfter = await this.Vault.startTime();

			// increase currentReleaseRatePerPeriod amount by this amount
			const increaseAmount = currentReleaseRatePerPeriod.mul(new BN('500')).div(new BN('10000'));

			expect(currentReleaseRatePerPeriod).to.bignumber.be.eq(ether('100000'));
			expect(currentReleaseRatePerBlock).to.bignumber.be.eq(
				currentReleaseRatePerPeriod.div(new BN(time.duration.weeks('1').div(new BN('3'))))
			);
			expect(startTime).to.bignumber.be.gt(new BN('0'));

			expect(currentReleaseRatePerPeriodAfter).to.bignumber.be.eq(
				currentReleaseRatePerPeriod.add(increaseAmount)
			);
			expect(currentReleaseRatePerBlockAfter).to.bignumber.be.eq(
				currentReleaseRatePerPeriodAfter.div(new BN(time.duration.weeks('1').div(new BN('3'))))
			);
			expect(startTimeAfter).to.bignumber.be.eq(startTime.add(new BN(time.duration.weeks('1'))));
		});

		it('should update the startime correctly after updating the release rate', async () => {
			const startTime = await this.Vault.startTime();

			// increase time
			await time.increase(time.duration.weeks('1'));
			// update accumulated funds
			await this.Vault.updateAllocatedFunds();

			const startTimeAfter = await this.Vault.startTime();

			expect(startTimeAfter).to.bignumber.be.eq(startTime.add(new BN(time.duration.weeks('1'))));
		});

		it('should reach the maxReleaseRatePerWeek on time correctly', async () => {
			let currentReleaseRatePerPeriod = await this.Vault.currentReleaseRatePerPeriod();
			let maxReleaseRatePerPeriod = await this.Vault.maxReleaseRatePerPeriod();

			// 	let noOfWeeks = 0;
			// while (!currentReleaseRatePerPeriod.eq(maxReleaseRatePerPeriod)) {
			// 	await time.increase(time.duration.weeks('1'));

			// 	// await updateAllocated funds
			// 	await this.Vault.updateAllocatedFunds();

			// 	currentReleaseRatePerPeriod = await this.Vault.currentReleaseRatePerPeriod();
			// 	maxReleaseRatePerPeriod = await this.Vault.maxReleaseRatePerPeriod();

			// 	noOfWeeks++;
			// }
			// // 46 weeks required to reach max release rate
			// console.log('Total no of weeks: ', noOfWeeks.toString());

			const startTime = await this.Vault.startTime();

			// increase time
			await time.increase(time.duration.weeks('46'));
			// await updateAllocated funds
			await this.Vault.updateAllocatedFunds();

			const currentReleaseRatePerPeriodAfter = await this.Vault.currentReleaseRatePerPeriod();
			const maxReleaseRatePerPeriodAfter = await this.Vault.maxReleaseRatePerPeriod();

			const currentReleaseRatePerBlock = await this.Vault.currentReleaseRatePerBlock();

			const startTimeAfter = await this.Vault.startTime();

			expect(startTimeAfter).to.bignumber.be.eq(startTime.add(new BN(time.duration.weeks('46'))));

			expect(currentReleaseRatePerPeriodAfter).to.bignumber.be.eq(maxReleaseRatePerPeriodAfter);
			expect(maxReleaseRatePerPeriodAfter).to.bignumber.be.eq(ether('1000000'));
			expect(currentReleaseRatePerBlock).to.bignumber.be.eq(
				maxReleaseRatePerPeriodAfter.div(new BN(time.duration.weeks('1')).div(new BN('3')))
			);
		});

		it('should not increase the currentReleaseRatePerPeriod after maxReleaRatePerWeek reaches', async () => {
			const currentReleaseRatePerPeriod = await this.Vault.currentReleaseRatePerPeriod();
			const maxReleaseRatePerPeriod = await this.Vault.maxReleaseRatePerPeriod();
			const currentReleaseRatePerBlock = await this.Vault.currentReleaseRatePerBlock();

			// increase time
			await time.increase(time.duration.weeks('1'));

			// update accumulated funds
			await this.Vault.updateAllocatedFunds();

			const currentReleaseRatePerPeriodAfter = await this.Vault.currentReleaseRatePerPeriod();
			const maxReleaseRatePerPeriodAfter = await this.Vault.maxReleaseRatePerPeriod();
			const currentReleaseRatePerBlockAfter = await this.Vault.currentReleaseRatePerBlock();

			expect(currentReleaseRatePerPeriod).to.bignumber.be.eq(currentReleaseRatePerPeriodAfter);
			expect(maxReleaseRatePerPeriod).to.bignumber.be.eq(maxReleaseRatePerPeriodAfter);
			expect(currentReleaseRatePerBlock).to.bignumber.be.eq(currentReleaseRatePerBlockAfter);
		});
	});

	describe('updateMaxReleaseRatePerPeriod()', async () => {
		it('should update the maxReleaseRatePerPeriod correctly', async () => {
			const maxReleaseRatePerPeriod = await this.Vault.maxReleaseRatePerPeriod();

			//update max release rate
			await this.Vault.updateMaxReleaseRatePerPeriod(ether('20000000'), {from: owner});

			const maxReleaseRatePerPeriodAfter = await this.Vault.maxReleaseRatePerPeriod();

			expect(maxReleaseRatePerPeriod).to.bignumber.be.eq(ether('1000000'));
			expect(maxReleaseRatePerPeriodAfter).to.bignumber.be.eq(ether('20000000'));
		});

		it('should revert when non-owner tries to update the release rate', async () => {
			await expectRevert(
				this.Vault.updateMaxReleaseRatePerPeriod(ether('2000000'), {from: user1}),
				'Vault: ONLY_ADMIN_CAN_CALL'
			);
		});

		it('should revert when owner tries to update the release rate with already set value', async () => {
			await expectRevert(
				this.Vault.updateMaxReleaseRatePerPeriod(ether('20000000'), {from: owner}),
				'Vault: ALREADY_SET'
			);
		});
	});

	describe('updateIncreasePercentage()', async () => {
		it('should update the updateIncreasePercentage correctly', async () => {
			const increasePercentage = await this.Vault.increasePercentage();

			//update increase percentage
			await this.Vault.updateIncreasePercentage('700', {from: owner});

			const increasePercentageAfter = await this.Vault.increasePercentage();

			expect(increasePercentage).to.bignumber.be.eq(new BN('500'));
			expect(increasePercentageAfter).to.bignumber.be.eq(new BN('700'));
		});

		it('should revert when non-owner tries to update the increase percentage', async () => {
			await expectRevert(
				this.Vault.updateIncreasePercentage('700', {from: user1}),
				'Vault: ONLY_ADMIN_CAN_CALL'
			);
		});

		it('should revert when owner tries to update the increase percentage with already set value', async () => {
			await expectRevert(
				this.Vault.updateIncreasePercentage('700', {from: owner}),
				'Vault: ALREADY_SET'
			);
		});
	});

	describe('updateIncreaseRateAfterPeriod()', async () => {
		it('should update the updateIncreaseRateAfterPeriod correctly', async () => {
			const increaseRateAfterPeriods = await this.Vault.increaseRateAfterPeriods();

			//update increase period duration
			await this.Vault.updateIncreaseRateAfterPeriod(time.duration.weeks('4'), {from: owner});

			const increaseRateAfterPeriodsAfter = await this.Vault.increaseRateAfterPeriods();

			expect(increaseRateAfterPeriods).to.bignumber.be.eq(new BN(time.duration.weeks('1')));
			expect(increaseRateAfterPeriodsAfter).to.bignumber.be.eq(new BN(time.duration.weeks('4')));
		});

		it('should revert when non-owner tries to update the increase period duration', async () => {
			await expectRevert(
				this.Vault.updateIncreaseRateAfterPeriod(time.duration.weeks('4'), {from: user1}),
				'Vault: ONLY_ADMIN_CAN_CALL'
			);
		});

		it('should revert when owner tries to update the increase period duration with already set value', async () => {
			await expectRevert(
				this.Vault.updateIncreaseRateAfterPeriod(time.duration.weeks('4'), {from: owner}),
				'Vault: ALREADY_SET'
			);
		});
	});

	describe('updateBlockTime()', async () => {
		it('should update the updateBlockTime correctly', async () => {
			const blockTime = await this.Vault.blockTime();

			//update block time
			await this.Vault.updateBlockTime('2', {from: owner});

			const blockTimeAfter = await this.Vault.blockTime();

			expect(blockTime).to.bignumber.be.eq(new BN('3'));
			expect(blockTimeAfter).to.bignumber.be.eq(new BN('2'));
		});

		it('should revert when non-owner tries to update the block time', async () => {
			await expectRevert(
				this.Vault.updateBlockTime('7', {from: user1}),
				'Vault: ONLY_ADMIN_CAN_CALL'
			);
		});

		it('should revert when owner tries to update the increase period duration with already set value', async () => {
			await expectRevert(this.Vault.updateBlockTime('2', {from: owner}), 'Vault: ALREADY_SET');
		});
	});

	describe('claimAllTokens()', () => {
		it('should claim tokens send to vault contract', async () => {
			//transfer tokens to Vault
			await this.SampleToken.mint(this.Vault.address, ether('5'), {from: owner});

			const vaultTokenBalBefore = await this.SampleToken.balanceOf(this.Vault.address);
			const owenerTokenBalBefore = await this.SampleToken.balanceOf(owner);

			// claim all tokens
			await this.Vault.claimAllTokens(owner, this.SampleToken.address, {from: owner});

			const vaultTokenBalAfter = await this.SampleToken.balanceOf(this.Vault.address);
			const owenerTokenBalAfter = await this.SampleToken.balanceOf(owner);

			expect(vaultTokenBalBefore).to.bignumber.be.eq(ether('5'));
			expect(owenerTokenBalBefore).to.bignumber.be.eq(new BN('0'));

			expect(vaultTokenBalAfter).to.bignumber.be.eq(new BN('0'));
			expect(owenerTokenBalAfter).to.bignumber.be.eq(ether('5'));
		});

		it('should revert when non-admin tries to claim all the tokens', async () => {
			await expectRevert(
				this.Vault.claimAllTokens(owner, this.LacToken.address, {from: minter}),
				'Vault: ONLY_ADMIN_CAN_CALL'
			);
		});

		it('should revert when admin tries to claim all the tokens to zero user address', async () => {
			await expectRevert(
				this.Vault.claimAllTokens(ZERO_ADDRESS, this.LacToken.address, {from: owner}),
				'Vault: INVALID_USER_ADDRESS'
			);
		});
		it('should revert when admin tries to claim all the tokens for zero token address', async () => {
			await expectRevert(
				this.Vault.claimAllTokens(owner, ZERO_ADDRESS, {from: owner}),
				'Vault: INVALID_TOKEN_ADDRESS'
			);
		});
		it('should revert when admin tries to claim all the tokens for LAC token address', async () => {
			await expectRevert(
				this.Vault.claimAllTokens(owner, this.LacToken.address, {from: owner}),
				'Vault: INVALID_TOKEN_ADDRESS'
			);
		});
	});

	describe('claimTokens()', () => {
		it('should claim specified amount of tokens send to Vault contract', async () => {
			//transfer tokens to Vault
			await this.SampleToken.mint(this.Vault.address, ether('5'), {from: owner});

			const vaultTokenBalBefore = await this.SampleToken.balanceOf(this.Vault.address);
			const minterTokenBalBefore = await this.SampleToken.balanceOf(minter);

			// claim all tokens
			await this.Vault.claimTokens(minter, this.SampleToken.address, ether('4'), {from: owner});

			const vaultTokenBalAfter = await this.SampleToken.balanceOf(this.Vault.address);
			const minterTokenBalAfter = await this.SampleToken.balanceOf(minter);

			expect(vaultTokenBalBefore).to.bignumber.be.eq(ether('5'));

			expect(vaultTokenBalAfter).to.bignumber.be.eq(ether('1'));
			expect(minterTokenBalAfter).to.bignumber.be.eq(minterTokenBalBefore.add(ether('4')));
		});

		it('should revert when non-admin tries to claim given no. of the tokens', async () => {
			await expectRevert(
				this.Vault.claimTokens(owner, this.SampleToken.address, ether('4'), {from: minter}),
				'Vault: ONLY_ADMIN_CAN_CALL'
			);
		});

		it('should revert when admin tries to claim  given no. of the tokens to zero user address', async () => {
			await expectRevert(
				this.Vault.claimTokens(ZERO_ADDRESS, this.SampleToken.address, ether('4'), {from: owner}),
				'Vault: INVALID_USER_ADDRESS'
			);
		});

		it('should revert when admin tries to claim  given no. of the tokens for zero token address', async () => {
			await expectRevert(
				this.Vault.claimTokens(owner, ZERO_ADDRESS, ether('4'), {from: owner}),
				'Vault: INVALID_TOKEN_ADDRESS'
			);
		});

		it('should revert when admin tries to claim  given no. of the tokens for LAC token address', async () => {
			await expectRevert(
				this.Vault.claimTokens(owner, this.LacToken.address, ether('4'), {from: owner}),
				'Vault: INVALID_TOKEN_ADDRESS'
			);
		});

		it('should revert when admin tries to claim invalid amount of tokens', async () => {
			await expectRevert(
				this.Vault.claimTokens(owner, this.SampleToken.address, ether('0'), {from: owner}),
				'Vault: INSUFFICIENT_BALANCE'
			);
			await expectRevert(
				this.Vault.claimTokens(owner, this.SampleToken.address, ether('2'), {from: owner}),
				'Vault: INSUFFICIENT_BALANCE'
			);
		});
	});

	describe('getTotalFundReceivers()', () => {
		it('should return total fund receivers correctly', async () => {
			const totalReceivers = await this.Vault.getTotalFundReceivers();
			expect(totalReceivers).to.bignumber.be.eq(new BN('3'));
		});
	});

	describe('getFundReceiverShare()', () => {
		it('should return fund receivers share correctly', async () => {
			const receiver1Share = await this.Vault.getFundReceiverShare(receiver1);
			const receiver2Share = await this.Vault.getFundReceiverShare(receiver2);
			const receiver3Share = await this.Vault.getFundReceiverShare(receiver3);
			expect(receiver1Share).to.bignumber.be.eq(new BN('800000000000'));
			expect(receiver2Share).to.bignumber.be.eq(new BN('100000000000'));
			expect(receiver3Share).to.bignumber.be.eq(new BN('100000000000'));
		});
	});

	describe('getPendingAccumulatedFunds()', () => {
		it('should get the pending accumulated funds correctly', async () => {
			//update allocated funds
			await this.Vault.updateAllocatedFunds();

			const currentPerBlockAmount = await this.Vault.currentReleaseRatePerBlock();

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

			//get pending accumulated funds
			const pendingFunds1 = await this.Vault.getPendingAccumulatedFunds(receiver1);
			const pendingFunds2 = await this.Vault.getPendingAccumulatedFunds(receiver2);
			const pendingFunds3 = await this.Vault.getPendingAccumulatedFunds(receiver3);

			expect(pendingFunds1).to.bignumber.be.eq(receiver1Share);
			expect(pendingFunds2).to.bignumber.be.eq(receiver2Share);
			expect(pendingFunds3).to.bignumber.be.eq(receiver3Share);
		});
	});

	describe('getMultiplier()', async () => {
		it('should get the multiplier correctly', async () => {
			const multiplier = await this.Vault.getMultiplier();
			const lastFundUpdatedTimestamp = await this.Vault.lastFundUpdatedTimestamp();

			// increase time by 6 seconds
			await time.increase(time.duration.seconds('6'));

			const currentTime = await time.latest();

			const multiplierAfter = await this.Vault.getMultiplier();

			expect(multiplier).to.bignumber.be.eq(new BN('0'));
			expect(multiplierAfter).to.bignumber.be.eq(
				currentTime.sub(lastFundUpdatedTimestamp).div(new BN('2'))
			);
		});
	});
});
