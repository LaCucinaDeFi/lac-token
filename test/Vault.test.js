require('chai').should();

const {expect} = require('chai');
const {expectRevert, BN, ether, time} = require('@openzeppelin/test-helpers');
const {deployProxy, upgradeProxy} = require('@openzeppelin/truffle-upgrades');
const {ZERO_ADDRESS} = require('@openzeppelin/test-helpers/src/constants');

const LacToken = artifacts.require('LacToken');
const Vault = artifacts.require('Vault');

function getAccumulatedAmount(pending, perBlockAmount, receiverShare, totalShare, totalBlocks) {
	return pending.add(perBlockAmount.mul(totalBlocks).mul(receiverShare).div(totalShare));
}

function getReceiverShare(perBlockAmount, receiverShare, totalShare, totalBlocks) {
	return perBlockAmount.mul(totalBlocks).mul(receiverShare).div(totalShare);
}
async function createSignature(
	pk,
	userAddress,
	claimAmount,
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
					{name: 'receiver', type: 'address'}
				]
			},
			domain: {
				name,
				version,
				chainId,
				verifyingContract: contractAddress
			},
			primaryType: 'Claim',
			message: {account: userAddress, amount: claimAmount, receiver: receiverAddress}
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
			console.log('fundreceiver2: ', receiver2);

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
			//increase time by 2 days
			await time.increase(time.duration.days('2'));

			const receiver1Pendings = await this.Vault.getPendingAccumulatedFunds(receiver1);
			const receiver2Pendings = await this.Vault.getPendingAccumulatedFunds(receiver2);
			console.log('receiver1Pendings: ', receiver1Pendings.toString());
			console.log('receiver2Pendings: ', receiver2Pendings.toString());

			// // add third fund receiver
			await this.Vault.shrinkReceiver(receiver1, receiver3, 1000, {from: owner});

			const receiver1PendingsAfter = await this.Vault.getPendingAccumulatedFunds(receiver1);
			const receiver2PendingsAfter = await this.Vault.getPendingAccumulatedFunds(receiver2);
			console.log('receiver1PendingsAfter: ', receiver1PendingsAfter.toString());
			console.log('receiver2PendingsAfter: ', receiver2PendingsAfter.toString());

			const fundReceiver1Details = await this.Vault.fundReceivers(receiver1);
			const fundReceiver2Details = await this.Vault.fundReceivers(receiver2);
			const fundReceiver3Details = await this.Vault.fundReceivers(receiver3);

			console.log(
				'receiver1 accumulated tokens: ',
				fundReceiver1Details.totalAccumulatedFunds.toString()
			);
			console.log(
				'receiver2 accumulated tokens: ',
				fundReceiver2Details.totalAccumulatedFunds.toString()
			);
			console.log(
				'receiver3 accumulated tokens: ',
				fundReceiver3Details.totalAccumulatedFunds.toString()
			);

			const totalShares = await this.Vault.totalShares();

			const receiver1AccumulatedFunds = getAccumulatedAmount(
				receiver1Pendings,
				currentPerBlockAmount,
				new BN('9000'),
				new BN('10000'),
				new BN('1')
			);
			const receiver2AccumulatedFunds = getAccumulatedAmount(
				receiver2Pendings,
				currentPerBlockAmount,
				new BN('1000'),
				new BN('10000'),
				new BN('1')
			);

			const receiver1Share = getReceiverShare(
				currentPerBlockAmount,
				new BN('9000'),
				new BN('10000'),
				new BN('1')
			);
			const receiver2Share = getReceiverShare(
				currentPerBlockAmount,
				new BN('1000'),
				new BN('10000'),
				new BN('1')
			);
			console.log('accumulatedFunds2: ', receiver2AccumulatedFunds.toString());
			console.log('receiver1Share: ', receiver1Share.toString());
			console.log('receiver2Share: ', receiver2Share.toString());

			//expect(receiver1Pendings).to.bignumber.be.eq(receiver1AccumulatedFunds);
			//	expect(receiver2Pendings).to.bignumber.be.eq(receiver2AccumulatedFunds.sub());
			expect(fundReceiver1Details.totalAccumulatedFunds).to.bignumber.be.eq(
				receiver1AccumulatedFunds
			);
			expect(fundReceiver2Details.totalAccumulatedFunds).to.bignumber.be.eq(
				receiver2AccumulatedFunds
			);
			expect(fundReceiver3Details.lacShare).to.bignumber.be.eq(new BN('1000'));
			expect(fundReceiver3Details.totalAccumulatedFunds).to.bignumber.be.eq(new BN('0'));

			expect(totalShares).to.bignumber.be.eq(new BN('10000'));
		});
	});

	describe('removeFundReceiverAddress()', () => {
		let totalRecievers;
		let receiver1Pendings;
		let receiver2Pendings;
		let receiver3Pendings;
		before('remove fund receiver', async () => {
			totalRecievers = await this.Vault.getTotalFundReceivers();
			receiver1Pendings = await this.Vault.getPendingAccumulatedFunds(receiver1);
			receiver2Pendings = await this.Vault.getPendingAccumulatedFunds(receiver2);
			receiver3Pendings = await this.Vault.getPendingAccumulatedFunds(receiver3);

			console.log('receiver1Pendings: ', receiver1Pendings.toString());
			console.log('receiver2Pendings: ', receiver2Pendings.toString());
			console.log('receiver3Pendings: ', receiver3Pendings.toString());

			// remove receiver3
			await this.Vault.removeFundReceiverAddress(receiver3, {from: owner});
		});

		it('should remove the fundReceiver correctly', async () => {
			const currentPerBlockAmount = await this.Vault.currentReleaseRatePerBlock();
			const receiver1AccumulatedFunds = getAccumulatedAmount(
				receiver1Pendings,
				currentPerBlockAmount,
				new BN('8000'),
				new BN('9000'),
				new BN('1')
			);

			console.log('accumulatedFunds: ', receiver1AccumulatedFunds.toString());

			const totalReceivers = await this.Vault.getTotalFundReceivers();
			const totalShare = await this.Vault.totalShares();
			const receiver1Details = await this.Vault.fundReceivers(receiver1);

			const receiver1PendingsAfter = await this.Vault.getPendingAccumulatedFunds(receiver1);
			const receiver2PendingsAfter = await this.Vault.getPendingAccumulatedFunds(receiver2);
			console.log('receiver1PendingsAfter: ', receiver1PendingsAfter.toString());
			console.log('receiver2PendingsAfter: ', receiver2PendingsAfter.toString());

			expect(totalReceivers).to.bignumber.be.eq(new BN('2'));
			expect(totalShare).to.bignumber.be.eq(new BN('9000'));
			expect(receiver1Details.lacShare).to.bignumber.be.eq(new BN('8000'));

			expect(receiver1PendingsAfter).to.bignumber.be.eq(receiver1AccumulatedFunds);
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

			receiver1Pendings = await this.Vault.getPendingAccumulatedFunds(receiver1);
			receiver2Pendings = await this.Vault.getPendingAccumulatedFunds(receiver2);
			receiver3Pendings = await this.Vault.getPendingAccumulatedFunds(receiver3);

			receiver1Details = await this.Vault.fundReceivers(receiver1);
			receiver2Details = await this.Vault.fundReceivers(receiver2);
			receiver3Details = await this.Vault.fundReceivers(receiver3);

			//increase time by 1 day
			await time.increase(time.duration.days('1'));

			//update allocated funds
			await this.Vault.updateAllocatedFunds();

			receiver1PendingsAfter = await this.Vault.getPendingAccumulatedFunds(receiver1);
			receiver2PendingsAfter = await this.Vault.getPendingAccumulatedFunds(receiver2);
			receiver3PendingsAfter = await this.Vault.getPendingAccumulatedFunds(receiver3);

			receiver1DetailsAfter = await this.Vault.fundReceivers(receiver1);
			receiver2DetailsAfter = await this.Vault.fundReceivers(receiver2);
			receiver3DetailsAfter = await this.Vault.fundReceivers(receiver3);

			const receiver1Share = getReceiverShare(
				currentPerBlockAmount,
				receiver1Details.lacShare,
				new BN('10000'),
				new BN('1')
			);
			const receiver2Share = getReceiverShare(
				currentPerBlockAmount,
				receiver2Details.lacShare,
				new BN('10000'),
				new BN('1')
			);
			const receiver3Share = getReceiverShare(
				currentPerBlockAmount,
				receiver3Details.lacShare,
				new BN('10000'),
				new BN('1')
			);

			expect(receiver1Pendings).to.bignumber.be.gt(new BN('0'));
			expect(receiver2Pendings).to.bignumber.be.gt(new BN('0'));
			expect(receiver3Pendings).to.bignumber.be.gt(new BN('0'));

			expect(receiver1Details.totalAccumulatedFunds).to.bignumber.be.gt(new BN('0'));
			expect(receiver1Details.totalAccumulatedFunds).to.bignumber.be.gt(new BN('0'));
			expect(receiver1Details.totalAccumulatedFunds).to.bignumber.be.gt(new BN('0'));

			expect(receiver1PendingsAfter).to.bignumber.be.eq(receiver1Share);
			expect(receiver2PendingsAfter).to.bignumber.be.eq(receiver2Share);
			expect(receiver3PendingsAfter).to.bignumber.be.eq(receiver3Share);

			expect(
				receiver1DetailsAfter.totalAccumulatedFunds.sub(receiver1Details.totalAccumulatedFunds)
			).to.bignumber.be.eq(receiver1Pendings);
			expect(
				receiver1DetailsAfter.totalAccumulatedFunds.sub(receiver2Details.totalAccumulatedFunds)
			).to.bignumber.be.eq(receiver2Pendings);
			expect(
				receiver1DetailsAfter.totalAccumulatedFunds.sub(receiver3Details.totalAccumulatedFunds)
			).to.bignumber.be.eq(receiver3Pendings);
		});
	});
});
