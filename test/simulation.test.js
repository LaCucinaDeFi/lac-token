require('chai').should();

const Web3 = require('web3');
const {expect} = require('chai');
const {BN, ether, time} = require('@openzeppelin/test-helpers');
const {deployProxy} = require('@openzeppelin/truffle-upgrades');
const {PRIVATE_KEY, PUBLIC_ADDRESS} = require('../secrets.test.json');
const {claim, createSignature} = require('./helper/helper');

const LacToken = artifacts.require('LacToken');
const Vault = artifacts.require('Vault');
const BlockData = artifacts.require('BlockData');
const SampleToken = artifacts.require('SampleToken');

contract.skip('Inclining Simulation', (accounts) => {
	const owner = accounts[0];
	const minter = accounts[1];
	const user1 = accounts[2];
	const user2 = accounts[3];
	const user3 = accounts[4];
	const vaultKeeper = accounts[8];
	const blocksPerPeriod = 100;
	let currentPerBlockAmount;
	before('deploy contract', async () => {
		// deploy LAC token
		this.LacToken = await LacToken.new('Lacucina Token', 'LAC', minter, ether('500000000'));

		// deploy Sample token
		this.SampleToken = await SampleToken.new();

		// deploy Vault
		this.Vault = await deployProxy(Vault, [
			'Vault',
			this.LacToken.address,
			ether('100000'), // min
			ether('1000000'), // max
			5000, // 50%
			blocksPerPeriod
		]);

		// mint LAC tokens to minter
		this.web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8555'));

		// add account
		await this.web3.eth.accounts.wallet.add('0x' + PRIVATE_KEY);
		this.pk = Buffer.from(PRIVATE_KEY, 'hex');

		this.BlockData = await BlockData.new();
		this.chainId = await this.BlockData.getChainId();

		// transfer lac tokens to Vault
		await this.LacToken.transfer(this.Vault.address, ether('500000000'), {
			from: minter
		});
	});

	describe('setup()', () => {
		it('add fundReceivers', async () => {
			// grant vaultKeeper role
			const VAULT_KEEPER = await this.Vault.VAULT_KEEPER();
			await this.Vault.grantRole(VAULT_KEEPER, vaultKeeper, {from: owner});
			await this.Vault.grantRole(VAULT_KEEPER, PUBLIC_ADDRESS);

			// add fund receiver1
			await this.Vault.setup(['receiver1', 'receiver2', 'receiver3'], [5000, 2500, 2500], {
				from: owner
			});
		});
	});

	describe('claim()', () => {
		let receiver1DetailsAfter;
		let receiver2DetailsAfter;
		let receiver3DetailsAfter;
		let startBlock;

		let currentNonceUser1;
		let signature;
		let receiver1;
		let receiver2;
		let receiver3;
		beforeEach('', async () => {
			startBlock = await this.Vault.startBlock();
			// get current nonce of user
			currentNonceUser1 = await this.Vault.userNonce(user1);
			receiver1 = 1;
			receiver2 = 2;
			receiver3 = 3;
		});

		it('should distribute correctly after 100 blocks', async () => {
			console.log('startBlock: ', startBlock.toString());

			const lastFundUpdatedBlock = await this.Vault.lastFundUpdatedBlock();
			console.log('lastFundUpdatedBlock: ', lastFundUpdatedBlock.toString());

			const blocksToIncrease = startBlock.add(new BN('100'));

			receiver1Details = await this.Vault.fundReceivers(receiver1);
			receiver2Details = await this.Vault.fundReceivers(receiver2);
			receiver3Details = await this.Vault.fundReceivers(receiver3);

			// increase 100 blocks
			await time.advanceBlockTo(blocksToIncrease);

			// claim 50k tokens
			await claim(this.Vault, user1, ether('40000'), receiver1, this.pk, this.chainId,'Vault');

			const currentBlockAfter = await this.BlockData.getBlock();
			console.log('currentBlockAfter: ', currentBlockAfter.toString());

			receiver1DetailsAfter = await this.Vault.fundReceivers(receiver1);
			receiver2DetailsAfter = await this.Vault.fundReceivers(receiver2);
			receiver3DetailsAfter = await this.Vault.fundReceivers(receiver3);

			console.log(
				'receiver1DetailsAfter: ',
				receiver1DetailsAfter.totalAccumulatedFunds.toString()
			);
			console.log(
				'receiver2DetailsAfter: ',
				receiver2DetailsAfter.totalAccumulatedFunds.toString()
			);
			console.log(
				'receiver3DetailsAfter: ',
				receiver3DetailsAfter.totalAccumulatedFunds.toString()
			);

			const user1Bal = await this.LacToken.balanceOf(user1);
			console.log('user1Bal: ', user1Bal.toString());
			const perBlockAmount = await this.Vault.currentReleaseRatePerBlock();
			console.log('perBlockAmount: ', perBlockAmount.toString());

			expect(perBlockAmount).to.bignumber.be.eq(ether('1500'));

			//add tokens accumulated in 101th block
			expect(receiver1DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(ether('10000'));
			expect(receiver2DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(ether('25000'));
			expect(receiver3DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(ether('25000'));
		});

		it('should distribute correctly after 200 blocks', async () => {
			const lastFundUpdatedBlock = await this.Vault.lastFundUpdatedBlock();
			console.log('lastFundUpdatedBlock: ', lastFundUpdatedBlock.toString());
			console.log('startBlock: ', startBlock.toString());

			const blocksToIncrease = startBlock.add(new BN('100'));

			receiver1Details = await this.Vault.fundReceivers(receiver1);
			receiver2Details = await this.Vault.fundReceivers(receiver2);
			receiver3Details = await this.Vault.fundReceivers(receiver3);

			// increase 100 more blocks
			await time.advanceBlockTo(blocksToIncrease);

			receiver1Details = await this.Vault.fundReceivers(receiver1);

			// claim 75k tokens
			await claim(this.Vault, user1, ether('84000'), receiver1, this.pk, this.chainId,'Vault');

			// claim 25k tokens
			await claim(this.Vault, user1, ether('25000'), receiver3, this.pk, this.chainId, 'Vault');

			const currentBlockAfter = await this.BlockData.getBlock();
			console.log('currentBlockAfter: ', currentBlockAfter.toString());

			receiver1DetailsAfter = await this.Vault.fundReceivers(receiver1);
			receiver2DetailsAfter = await this.Vault.fundReceivers(receiver2);
			receiver3DetailsAfter = await this.Vault.fundReceivers(receiver3);

			console.log(
				'receiver1DetailsAfter: ',
				receiver1DetailsAfter.totalAccumulatedFunds.toString()
			);
			console.log(
				'receiver2DetailsAfter: ',
				receiver2DetailsAfter.totalAccumulatedFunds.toString()
			);
			console.log(
				'receiver3DetailsAfter: ',
				receiver3DetailsAfter.totalAccumulatedFunds.toString()
			);

			const user1Bal = await this.LacToken.balanceOf(user1);
			console.log('user1Bal: ', user1Bal.toString());

			const perBlockAmount = await this.Vault.currentReleaseRatePerBlock();
			console.log('perBlockAmount: ', perBlockAmount.toString());

			expect(perBlockAmount).to.bignumber.be.eq(ether('2250'));

			//add tokens accumulated in 1001st block
			expect(receiver1DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(
				ether('1000').add(ether('375')) // 375 <= (1500 / block ) * 50%  ???????
			);
			expect(receiver2DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(
				ether('62500').add(ether('187.5'))
			);
			expect(receiver3DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(
				ether('37500').add(ether('187.5'))
			);
		});

		it('should distribute correctly after 300 blocks', async () => {
			const lastFundUpdatedBlock = await this.Vault.lastFundUpdatedBlock();
			console.log('lastFundUpdatedBlock: ', lastFundUpdatedBlock.toString());
			console.log('startBlock: ', startBlock.toString());

			const blocksToIncrease = startBlock.add(new BN('100'));

			receiver1Details = await this.Vault.fundReceivers(receiver1);
			receiver2Details = await this.Vault.fundReceivers(receiver2);
			receiver3Details = await this.Vault.fundReceivers(receiver3);

			// increase 500 blocks
			await time.advanceBlockTo(blocksToIncrease);

			// claim 20k tokens
			await claim(this.Vault, user1, ether('111500'), receiver1, this.pk, this.chainId, 'Vault');

			// claim 20k tokens
			await claim(this.Vault, user1, ether('26250'), receiver2, this.pk, this.chainId, 'Vault');

			const currentBlockAfter = await this.BlockData.getBlock();
			console.log('currentBlockAfter: ', currentBlockAfter.toString());

			receiver1DetailsAfter = await this.Vault.fundReceivers(receiver1);
			receiver2DetailsAfter = await this.Vault.fundReceivers(receiver2);
			receiver3DetailsAfter = await this.Vault.fundReceivers(receiver3);

			// console.log('receiver1Details: ', receiver1Details.totalAccumulatedFunds.toString());
			// console.log('receiver2Details: ', receiver2Details.totalAccumulatedFunds.toString());
			// console.log('receiver3Details: ', receiver3Details.totalAccumulatedFunds.toString());

			console.log(
				'receiver1DetailsAfter: ',
				receiver1DetailsAfter.totalAccumulatedFunds.toString()
			);
			console.log(
				'receiver2DetailsAfter: ',
				receiver2DetailsAfter.totalAccumulatedFunds.toString()
			);
			console.log(
				'receiver3DetailsAfter: ',
				receiver3DetailsAfter.totalAccumulatedFunds.toString()
			);

			const user1Bal = await this.LacToken.balanceOf(user1);
			console.log('user1Bal: ', user1Bal.toString());
			const perBlockAmount = await this.Vault.currentReleaseRatePerBlock();
			console.log('perBlockAmount: ', perBlockAmount.toString());

			expect(perBlockAmount).to.bignumber.be.eq(ether('3375'));

			//add tokens accumulated in 1501st block
			expect(receiver1DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(
				ether('2000').add(ether('375'))
			);
			expect(receiver2DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(
				ether('62500').add(ether('187.5'))
			);
			expect(receiver3DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(
				ether('10250').add(ether('10.5'))
			);
		});

		it.skip('should distribute correctly after 2000 blocks', async () => {
			const lastFundUpdatedBlock = await this.Vault.lastFundUpdatedBlock();
			console.log('lastFundUpdatedBlock: ', lastFundUpdatedBlock.toString());
			console.log('startBlock: ', startBlock.toString());

			const blocksToIncrease = startBlock.add(new BN('1000'));

			receiver1Details = await this.Vault.fundReceivers(receiver1);
			receiver2Details = await this.Vault.fundReceivers(receiver2);
			receiver3Details = await this.Vault.fundReceivers(receiver3);

			// increase 500 blocks
			await time.advanceBlockTo(blocksToIncrease);

			const receiver1Pending = await this.Vault.getPendingAccumulatedFunds(1);
			const receiver2Pending = await this.Vault.getPendingAccumulatedFunds(2);
			const receiver3Pending = await this.Vault.getPendingAccumulatedFunds(3);

			console.log('receiver1Pending: ', receiver1Pending.toString());
			console.log('receiver2Pending: ', receiver2Pending.toString());
			console.log('receiver3Pending: ', receiver3Pending.toString());

			// // claim 64k tokens
			await claim(this.Vault, user1, ether('112500'), receiver1, this.pk, this.chainId, 'Vault');

			// // claim 10.5 tokens
			await claim(this.Vault, user1, ether('10500'), receiver2, this.pk, this.chainId, 'Vault');

			// // claim 10.5 tokens
			await claim(this.Vault, user1, ether('15500'), receiver3, this.pk, this.chainId, 'Vault');

			const currentBlockAfter = await this.BlockData.getBlock();
			console.log('currentBlockAfter: ', currentBlockAfter.toString());

			receiver1DetailsAfter = await this.Vault.fundReceivers(receiver1);
			receiver2DetailsAfter = await this.Vault.fundReceivers(receiver2);
			receiver3DetailsAfter = await this.Vault.fundReceivers(receiver3);

			// console.log('receiver1Details: ', receiver1Details.totalAccumulatedFunds.toString());
			// console.log('receiver2Details: ', receiver2Details.totalAccumulatedFunds.toString());
			// console.log('receiver3Details: ', receiver3Details.totalAccumulatedFunds.toString());

			console.log(
				'receiver1DetailsAfter: ',
				receiver1DetailsAfter.totalAccumulatedFunds.toString()
			);
			console.log(
				'receiver2DetailsAfter: ',
				receiver2DetailsAfter.totalAccumulatedFunds.toString()
			);
			console.log(
				'receiver3DetailsAfter: ',
				receiver3DetailsAfter.totalAccumulatedFunds.toString()
			);

			const user1Bal = await this.LacToken.balanceOf(user1);
			console.log('user1Bal: ', user1Bal.toString());
			const perBlockAmount = await this.Vault.currentReleaseRatePerBlock();
			console.log('perBlockAmount: ', perBlockAmount.toString());

			expect(perBlockAmount).to.bignumber.be.eq(ether('3375'));

			//add tokens accumulated in 1501st block
			expect(receiver1DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(
				ether('1000').add(ether('375'))
			);
			expect(receiver2DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(
				ether('10500').add(ether('11.025'))
			);
			expect(receiver3DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(ether('11.025'));
		});
	});
});
